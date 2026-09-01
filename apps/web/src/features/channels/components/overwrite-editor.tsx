import { Permissions } from "@opencord/shared/permissions";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  channelOverwritesQuery,
  serverChannelsQuery,
} from "@/features/channels/api/queries";
import { OverwriteRow } from "@/features/channels/components/overwrite-row";
import {
  type OverwriteState,
  stateOf,
  withState,
} from "@/features/channels/lib/overwrites";
import { serverMembersQuery } from "@/features/members/api/queries";
import { serverRolesQuery } from "@/features/roles/api/queries";
import { PERMISSION_NAMES } from "@/features/roles/lib/permissions";
import { api } from "@/lib/api-client";

interface Target {
  kind: "roles" | "members";
  id: string;
  label: string;
}

const EMPTY = { allow: 0, deny: 0 };

export function OverwriteEditor({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const channelId = useId();
  const targetId = useId();

  const [selectedChannel, setSelectedChannel] = useState("");
  const [selectedTarget, setSelectedTarget] = useState("");

  const { data: channels } = useQuery(serverChannelsQuery(serverId));
  const { data: roles } = useQuery(serverRolesQuery(serverId));
  const { data: members } = useInfiniteQuery(serverMembersQuery(serverId));

  const channel = selectedChannel === "" ? channels?.[0]?.id : selectedChannel;

  const { data: overwrites } = useQuery({
    ...channelOverwritesQuery(channel ?? ""),
    enabled: channel !== undefined,
  });

  const targets = useMemo<Target[]>(
    () => [
      ...(roles ?? []).map((role) => ({
        kind: "roles" as const,
        id: role.id,
        label: role.name,
      })),
      ...(members?.pages ?? [])
        .flatMap((page) => page.data)
        .map((entry) => ({
          kind: "members" as const,
          id: entry.user.id,
          label: entry.user.name,
        })),
    ],
    [members, roles],
  );

  const target =
    targets.find((entry) => `${entry.kind}:${entry.id}` === selectedTarget) ??
    targets[0];

  const stored =
    target === undefined
      ? EMPTY
      : target.kind === "roles"
        ? (overwrites?.roles.find((entry) => entry.roleId === target.id) ??
          EMPTY)
        : (overwrites?.members.find((entry) => entry.userId === target.id) ??
          EMPTY);

  const [draft, setDraft] = useState<{ allow: number; deny: number } | null>(
    null,
  );

  const masks = draft ?? { allow: stored.allow, deny: stored.deny };

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["channels", channel ?? "", "overwrites"],
    });
  };

  const save = useMutation({
    mutationFn: () =>
      api<unknown>(
        `/channels/${channel ?? ""}/overwrites/${target?.kind ?? "roles"}/${target?.id ?? ""}`,
        { method: "PUT", body: masks },
      ),
    onSuccess: async () => {
      setDraft(null);
      await refresh();
    },
  });

  const clear = useMutation({
    mutationFn: () =>
      api<unknown>(
        `/channels/${channel ?? ""}/overwrites/${target?.kind ?? "roles"}/${target?.id ?? ""}`,
        { method: "DELETE" },
      ),
    onSuccess: async () => {
      setDraft(null);
      await refresh();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <Field>
          <FieldLabel htmlFor={channelId}>Channel</FieldLabel>
          <select
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
            id={channelId}
            onChange={(event) => {
              setSelectedChannel(event.target.value);
              setDraft(null);
            }}
            value={channel ?? ""}
          >
            {(channels ?? []).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name ?? entry.id}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <FieldLabel htmlFor={targetId}>Role or member</FieldLabel>
          <select
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
            id={targetId}
            onChange={(event) => {
              setSelectedTarget(event.target.value);
              setDraft(null);
            }}
            value={target === undefined ? "" : `${target.kind}:${target.id}`}
          >
            {targets.map((entry) => (
              <option
                key={`${entry.kind}:${entry.id}`}
                value={`${entry.kind}:${entry.id}`}
              >
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <ul className="flex flex-col gap-1">
        {PERMISSION_NAMES.map((name) => {
          const bit = Permissions[name];

          return (
            <OverwriteRow
              key={name}
              name={name}
              onChange={(next: OverwriteState) => {
                setDraft(withState(masks, bit, next));
              }}
              state={stateOf(masks.allow, masks.deny, bit)}
            />
          );
        })}
      </ul>

      <div className="flex items-center gap-2">
        <Button
          disabled={target === undefined || save.isPending}
          onClick={() => {
            save.mutate();
          }}
          size="sm"
        >
          {save.isPending ? "Saving…" : "Save overwrite"}
        </Button>
        <Button
          disabled={target === undefined || clear.isPending}
          onClick={() => {
            clear.mutate();
          }}
          size="sm"
          variant="outline"
        >
          Clear overwrite
        </Button>
      </div>
    </div>
  );
}
