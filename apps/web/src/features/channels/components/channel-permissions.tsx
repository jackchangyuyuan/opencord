import { Permissions } from "@opencord/shared/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { channelOverwritesQuery } from "@/features/channels/api/queries";
import { OverwriteRow } from "@/features/channels/components/overwrite-row";
import {
  type OverwriteState,
  stateOf,
  withState,
} from "@/features/channels/lib/overwrites";
import {
  has,
  useServerPermissions,
} from "@/features/permissions/hooks/use-permissions";
import { serverRolesQuery } from "@/features/roles/api/queries";
import { CHANNEL_PERMISSION_NAMES } from "@/features/roles/lib/permissions";
import { api, ApiError } from "@/lib/api-client";

interface Target {
  id: string;
  label: string;
  isDefault: boolean;
  base: number;
}

const EMPTY = { allow: 0, deny: 0 };

interface Save {
  roleId: string;
  masks: { allow: number; deny: number };
}

function overriddenCount(masks: { allow: number; deny: number }): number {
  const set = masks.allow | masks.deny;

  return CHANNEL_PERMISSION_NAMES.filter(
    (name) => (set & Permissions[name]) === Permissions[name],
  ).length;
}

export function ChannelPermissions({
  channelId,
  channelName,
  serverId,
}: {
  channelId: string;
  channelName: string;
  serverId: string;
}) {
  const queryClient = useQueryClient();
  const targetId = useId();

  const [selectedTarget, setSelectedTarget] = useState("");

  const mayManage = has(
    useServerPermissions(serverId),
    Permissions.MANAGE_ROLES,
  );

  const { data: roles } = useQuery(serverRolesQuery(serverId));
  const { data: overwrites } = useQuery(channelOverwritesQuery(channelId));

  const everyone = roles?.find((role) => role.isDefault);

  const targets = useMemo<Target[]>(() => {
    const base = everyone?.permissions ?? 0;

    return [
      ...(roles ?? [])
        .filter((role) => role.isDefault)
        .map((role) => ({
          id: role.id,
          label: role.name,
          isDefault: true,
          base,
        })),
      ...(roles ?? [])
        .filter((role) => !role.isDefault)
        .map((role) => ({
          id: role.id,
          label: role.name,
          isDefault: false,
          base: base | role.permissions,
        })),
    ];
  }, [everyone, roles]);

  const target =
    targets.find((entry) => entry.id === selectedTarget) ?? targets[0];

  const targetLabels = useMemo(
    () => Object.fromEntries(targets.map((entry) => [entry.id, entry.label])),
    [targets],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = {};

    for (const entry of overwrites?.roles ?? []) {
      map[entry.roleId] = overriddenCount(entry);
    }

    return map;
  }, [overwrites]);

  const stored =
    target === undefined
      ? EMPTY
      : (overwrites?.roles.find((entry) => entry.roleId === target.id) ??
        EMPTY);

  const [draft, setDraft] = useState<{ allow: number; deny: number } | null>(
    null,
  );

  const masks = draft ?? { allow: stored.allow, deny: stored.deny };

  if (draft !== null && !mayManage) {
    setDraft(null);
  }

  const save = useMutation({
    meta: { inline: true },
    mutationFn: (input: Save) => {
      const path = `/channels/${channelId}/overwrites/roles/${input.roleId}`;

      return input.masks.allow === 0 && input.masks.deny === 0
        ? api<unknown>(path, { method: "DELETE" })
        : api<unknown>(path, { method: "PUT", body: input.masks });
    },
    onSuccess: (_data, context) => {
      queryClient.setQueryData(
        channelOverwritesQuery(channelId).queryKey,
        (current) =>
          current === undefined
            ? current
            : {
                ...current,
                roles: [
                  ...current.roles.filter(
                    (entry) => entry.roleId !== context.roleId,
                  ),
                  ...(context.masks.allow === 0 && context.masks.deny === 0
                    ? []
                    : [{ roleId: context.roleId, ...context.masks }]),
                ],
              },
      );

      setDraft(null);

      void queryClient.invalidateQueries({
        queryKey: channelOverwritesQuery(channelId).queryKey,
      });
    },
  });

  const failure = save.error;
  const dirty = masks.allow !== stored.allow || masks.deny !== stored.deny;

  const option = (entry: Target) => {
    const count = counts[entry.id] ?? 0;

    return (
      <SelectItem key={entry.id} value={entry.id}>
        <span className="truncate">{entry.label}</span>
        {count === 0 ? null : (
          <span className="ml-auto pl-3 text-xs text-muted-foreground">
            {count === 1 ? "1 override" : `${String(count)} overrides`}
          </span>
        )}
      </SelectItem>
    );
  };

  return (
    <div className="flex min-h-full flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Exceptions for <span className="font-medium">#{channelName}</span>, by
        role. Inherit keeps what Server settings → Roles grants.
      </p>

      <Field>
        <FieldLabel htmlFor={targetId}>Role</FieldLabel>
        <div className="flex items-center gap-3">
          <Select
            disabled={targets.length === 0}
            items={targetLabels}
            onValueChange={(next: string | null) => {
              setSelectedTarget(next ?? "");
              setDraft(null);
              save.reset();
            }}
            value={target?.id ?? ""}
          >
            <SelectTrigger className="w-full sm:w-72" id={targetId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{targets.map(option)}</SelectContent>
          </Select>
          <span className="shrink-0 text-xs text-muted-foreground">
            {overriddenCount(masks) === 0
              ? `Inheriting all ${String(CHANNEL_PERMISSION_NAMES.length)}`
              : `${String(overriddenCount(masks))} of ${String(CHANNEL_PERMISSION_NAMES.length)} overridden`}
          </span>
        </div>
      </Field>

      <ul className="flex flex-col gap-1">
        {CHANNEL_PERMISSION_NAMES.map((name) => {
          const bit = Permissions[name];

          return (
            <OverwriteRow
              key={name}
              disabled={!mayManage}
              {...(target === undefined
                ? {}
                : { inherited: (target.base & bit) === bit })}
              name={name}
              onChange={(next: OverwriteState) => {
                setDraft(withState(masks, bit, next));
              }}
              state={stateOf(masks.allow, masks.deny, bit)}
            />
          );
        })}
      </ul>

      {mayManage ? null : (
        <p className="text-sm text-muted-foreground" role="status">
          You can read how this channel is configured, but changing it needs
          Manage roles.
        </p>
      )}

      {failure == null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {failure instanceof ApiError
            ? failure.message
            : "Could not save the override"}
        </p>
      )}

      {/* Absent rather than disabled, which is the rule every other refused
          action in this app follows. A greyed Save and a greyed Reset under a
          panel somebody may only read are two controls advertising a permission
          they do not hold; the sentence above already says which bit is
          missing, and the API refuses the call regardless of what the DOM was
          talked into showing. */}
      {mayManage ? (
        <div className="mt-auto flex items-center gap-2 pt-2">
          <Button
            disabled={target === undefined || save.isPending || !dirty}
            onClick={() => {
              if (target !== undefined) {
                save.mutate({ roleId: target.id, masks });
              }
            }}
            size="sm"
          >
            {save.isPending ? "Saving…" : "Save overrides"}
          </Button>
          {overriddenCount(masks) === 0 ? null : (
            <Button
              disabled={target === undefined}
              onClick={() => {
                setDraft(EMPTY);
              }}
              size="sm"
              variant="outline"
            >
              Reset to default
            </Button>
          )}
          {dirty ? (
            <span className="text-xs text-muted-foreground">Unsaved</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
