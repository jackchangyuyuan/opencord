import { Permissions } from "@opencord/shared/permissions";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Hash, Volume2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  type ChannelListEntry,
  channelOverwritesQuery,
  serverChannelsQuery,
} from "@/features/channels/api/queries";
import { OverwriteRow } from "@/features/channels/components/overwrite-row";
import {
  type OverwriteMasks,
  stateOf,
  withState,
} from "@/features/channels/lib/overwrites";
import type { ServerRoleSummary } from "@/features/roles/api/queries";
import { CHANNEL_PERMISSION_NAMES } from "@/features/roles/lib/permissions";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";

const EMPTY: OverwriteMasks = { allow: 0, deny: 0 };

function overriddenCount(masks: OverwriteMasks): number {
  const set = masks.allow | masks.deny;

  return CHANNEL_PERMISSION_NAMES.filter(
    (name) => (set & Permissions[name]) === Permissions[name],
  ).length;
}

function ChannelIcon({ type }: { type: ChannelListEntry["type"] }) {
  const Icon = type === "voice" ? Volume2 : Hash;

  return <Icon aria-hidden className="size-3.5 shrink-0" />;
}

export function RoleChannelOverrides({
  everyonePermissions,
  readOnly,
  role,
  serverId,
}: {
  everyonePermissions: number;
  readOnly: boolean;
  role: ServerRoleSummary;
  serverId: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<OverwriteMasks | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const channels = useQueries({
    queries: [serverChannelsQuery(serverId)],
    combine: (results) => results[0],
  });

  const listed = (channels.data ?? []).filter(
    (channel) => channel.type === "text" || channel.type === "voice",
  );

  const overwrites = useQueries({
    queries: listed.map((channel) => channelOverwritesQuery(channel.id)),
    combine: (results) => ({
      byChannel: new Map(
        results.map((result, index) => [
          listed[index]?.id ?? "",
          result.data?.roles.find((entry) => entry.roleId === role.id) ?? null,
        ]),
      ),
      pending: results.some((result) => result.isPending),
    }),
  });

  const base = everyonePermissions | role.permissions;

  const put = useMutation({
    meta: { inline: true },
    mutationFn: ({
      channelId,
      masks,
    }: {
      channelId: string;
      masks: OverwriteMasks;
    }) =>
      masks.allow === 0 && masks.deny === 0
        ? api<unknown>(`/channels/${channelId}/overwrites/roles/${role.id}`, {
            method: "DELETE",
          })
        : api<unknown>(`/channels/${channelId}/overwrites/roles/${role.id}`, {
            method: "PUT",
            body: masks,
          }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["channels", variables.channelId, "overwrites"],
      });
      setDraft(null);
      setSaved(variables.channelId);
    },
  });

  if (channels.isPending || overwrites.pending) {
    return (
      <p className="py-4 text-sm text-muted-foreground">Loading channels…</p>
    );
  }

  if (listed.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        This server has no channels to override yet.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {put.error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {put.error instanceof ApiError
            ? put.error.message
            : "Could not save the override"}
        </p>
      )}

      <ul
        aria-label={`Channel overrides for ${role.name}`}
        className="flex flex-col divide-y divide-border/70"
      >
        {listed.map((channel) => {
          const stored = overwrites.byChannel.get(channel.id) ?? null;
          const masks: OverwriteMasks =
            stored === null
              ? EMPTY
              : { allow: stored.allow, deny: stored.deny };
          const count = overriddenCount(masks);
          const expanded = open === channel.id;
          const editing = expanded && draft !== null ? draft : masks;
          const dirty =
            editing.allow !== masks.allow || editing.deny !== masks.deny;

          return (
            <li className="flex flex-col" key={channel.id}>
              <button
                aria-expanded={expanded}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-1 py-2 text-left text-sm transition-colors",
                  "hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                )}
                onClick={() => {
                  setOpen(expanded ? null : channel.id);
                  setDraft(expanded ? null : masks);
                  setSaved(null);
                  put.reset();
                }}
                type="button"
              >
                <ChannelIcon type={channel.type} />
                <span className="min-w-0 flex-1 truncate">
                  {channel.name ?? "Unnamed channel"}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    count === 0
                      ? "text-muted-foreground"
                      : "font-medium text-foreground",
                  )}
                >
                  {count === 0
                    ? "Role defaults"
                    : `${String(count)} override${count === 1 ? "" : "s"}`}
                </span>
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    expanded && "rotate-180",
                  )}
                />
              </button>

              {expanded ? (
                <div className="flex flex-col gap-2 px-1 pb-3">
                  <ul className="flex flex-col">
                    {CHANNEL_PERMISSION_NAMES.map((name) => (
                      <OverwriteRow
                        disabled={readOnly}
                        inherited={
                          (base & Permissions[name]) === Permissions[name]
                        }
                        key={name}
                        name={name}
                        onChange={(next) => {
                          setDraft(withState(editing, Permissions[name], next));
                        }}
                        state={stateOf(
                          editing.allow,
                          editing.deny,
                          Permissions[name],
                        )}
                      />
                    ))}
                  </ul>

                  {readOnly ? null : (
                    <div className="flex items-center gap-2">
                      <Button
                        disabled={put.isPending || !dirty}
                        onClick={() => {
                          put.mutate({
                            channelId: channel.id,
                            masks: editing,
                          });
                        }}
                        size="sm"
                      >
                        {put.isPending ? "Saving…" : "Save override"}
                      </Button>
                      {overriddenCount(editing) === 0 ? null : (
                        <Button
                          onClick={() => {
                            setDraft(EMPTY);
                            setSaved(null);
                          }}
                          size="sm"
                          variant="ghost"
                        >
                          Reset to role defaults
                        </Button>
                      )}
                      {dirty ? (
                        <span className="text-xs text-muted-foreground">
                          Unsaved
                        </span>
                      ) : saved === channel.id ? (
                        <span
                          className="text-xs text-muted-foreground"
                          role="status"
                        >
                          Saved
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
