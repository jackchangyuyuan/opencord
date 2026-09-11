import { Permissions } from "@opencord/shared/permissions";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link2, Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { FilterMenu } from "@/components/data-list/filter-menu";
import {
  ListError,
  ListSkeleton,
  NoMatches,
  NothingYet,
} from "@/components/data-list/list-states";
import {
  type ActiveFilter,
  ListToolbar,
} from "@/components/data-list/list-toolbar";
import { matches } from "@/components/data-list/matches";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Truncated } from "@/components/ui/truncated";
import {
  type InviteSummary,
  inviteUrl,
  serverInvitesQuery,
  serverInvitesQueryKey,
} from "@/features/invites/api/queries";
import { inviteExpiry, refreshInterval } from "@/features/invites/lib/expiry";
import {
  has,
  useServerPermissions,
} from "@/features/permissions/hooks/use-permissions";
import {
  SettingsList,
  SettingsPage,
} from "@/features/server-settings/components/settings-page";
import { useSettingsState } from "@/features/server-settings/lib/settings-state";
import { currentUserQuery, userQuery } from "@/features/users/api/queries";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { bareTerm, matchesIdentity, toHandle } from "@/lib/identity";

interface InviteFilters {
  status: "active" | "dead" | null;
  expiry: "temporary" | "permanent" | null;
  inviterIds: string[];
}

const NO_INVITE_FILTERS: InviteFilters = {
  status: null,
  expiry: null,
  inviterIds: [],
};

const CREATED = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function usage(invite: InviteSummary): string {
  if (invite.maxUses === null) {
    return invite.uses === 1
      ? "Used once"
      : `Used ${String(invite.uses)} times`;
  }

  return `${String(invite.uses)} of ${String(invite.maxUses)} uses`;
}

function parseOptional(value: string): number | null {
  const parsed = Number(value);

  return value === "" || Number.isNaN(parsed) ? null : parsed;
}

export function InvitesPage({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const permissions = useServerPermissions(serverId);
  const maxUsesId = useId();
  const expiresId = useId();

  const { data: me } = useQuery(currentUserQuery);
  const { data, isPending, isError } = useQuery(serverInvitesQuery(serverId));

  const [term, setTerm] = useSettingsState("invites:search", "");
  const [filters, setFilters] = useSettingsState<InviteFilters>(
    "invites:filters",
    NO_INVITE_FILTERS,
  );
  const [creating, setCreating] = useSettingsState("invites:creating", false);
  const [maxUses, setMaxUses] = useSettingsState("invites:max-uses", "");
  const [expiresInHours, setExpiresInHours] = useSettingsState(
    "invites:expires",
    "",
  );
  const [copied, setCopied] = useState<string | null>(null);

  const [now, setNow] = useState(() => Date.now());
  const interval = refreshInterval(data ?? [], now);

  useEffect(() => {
    if (interval === null) {
      return;
    }

    const timer = setInterval(() => {
      setNow(Date.now());
    }, interval);

    return () => {
      clearInterval(timer);
    };
  }, [interval]);

  const inviterIds = [
    ...new Set((data ?? []).map((invite) => invite.inviterId)),
  ];

  const inviters = useQueries({
    queries: inviterIds.map((userId) => userQuery(userId)),
    combine: (results) =>
      new Map(
        results.map((result, index) => [
          inviterIds[index] ?? "",
          result.data ?? null,
        ]),
      ),
  });

  const create = useMutation({
    meta: { inline: true },
    mutationFn: () =>
      api<InviteSummary>(`/servers/${serverId}/invites`, {
        method: "POST",
        body: {
          maxUses: parseOptional(maxUses),
          expiresInHours: parseOptional(expiresInHours),
        },
      }),
    onSuccess: async (invite) => {
      await queryClient.invalidateQueries({
        queryKey: serverInvitesQueryKey(serverId),
      });
      setCreating(false);
      setMaxUses("");
      setExpiresInHours("");
      setCopied(null);
      void navigator.clipboard
        .writeText(inviteUrl(invite.code))
        .then(() => {
          setCopied(invite.code);
        })
        .catch(() => undefined);
    },
  });

  const revoke = useMutation({
    meta: { inline: true },
    mutationFn: (code: string) =>
      api<unknown>(`/servers/${serverId}/invites/${code}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: serverInvitesQueryKey(serverId),
      });
    },
  });

  const mayManage = has(permissions, Permissions.MANAGE_SERVER);
  const mayCreate = has(permissions, Permissions.CREATE_INVITE);

  const mayRevoke = (invite: InviteSummary) =>
    mayManage || invite.inviterId === me?.id;

  const handleOf = (userId: string) =>
    inviters.get(userId) === null || inviters.get(userId) === undefined
      ? "unknown"
      : toHandle(inviters.get(userId)?.username ?? "unknown");

  const nameOf = (userId: string) => inviters.get(userId)?.name ?? "";

  const suggestions = inviterIds
    .map((userId) => inviters.get(userId))
    .filter((entry) => entry !== null && entry !== undefined)
    .map((entry) => ({
      id: entry.id,
      username: entry.username,
      name: entry.name,
    }));

  const shown = (data ?? []).filter((invite) => {
    const expiry = inviteExpiry(invite, now);
    const dead = expiry.state === "expired" || expiry.state === "exhausted";

    if (filters.status === "active" && dead) {
      return false;
    }

    if (filters.status === "dead" && !dead) {
      return false;
    }

    if (filters.expiry === "temporary" && invite.expiresAt === null) {
      return false;
    }

    if (filters.expiry === "permanent" && invite.expiresAt !== null) {
      return false;
    }

    if (
      filters.inviterIds.length > 0 &&
      !filters.inviterIds.includes(invite.inviterId)
    ) {
      return false;
    }

    const inviter = inviters.get(invite.inviterId);

    return (
      matches(bareTerm(term), invite.code) ||
      (inviter !== null &&
        inviter !== undefined &&
        matchesIdentity(term, inviter))
    );
  });

  const clear = () => {
    setTerm("");
    setFilters(NO_INVITE_FILTERS);
  };

  const chips: ActiveFilter[] = [
    ...(filters.status === null
      ? []
      : [
          {
            id: "status",
            label: filters.status === "active" ? "Active" : "Expired",
            onRemove: () => {
              setFilters({ ...filters, status: null });
            },
          },
        ]),
    ...(filters.expiry === null
      ? []
      : [
          {
            id: "expiry",
            label: filters.expiry === "temporary" ? "Temporary" : "Permanent",
            onRemove: () => {
              setFilters({ ...filters, expiry: null });
            },
          },
        ]),
    ...filters.inviterIds.map((userId) => ({
      id: `creator:${userId}`,
      label: `Creator: ${handleOf(userId)}`,
      onRemove: () => {
        setFilters({
          ...filters,
          inviterIds: filters.inviterIds.filter((entry) => entry !== userId),
        });
      },
    })),
  ];

  const narrowed = term.trim() !== "" || chips.length > 0;

  return (
    <SettingsPage
      actions={
        mayCreate ? (
          <Button
            onClick={() => {
              setCreating(!creating);
            }}
            size="sm"
          >
            <Plus data-icon="inline-start" />
            Create invite
          </Button>
        ) : undefined
      }
      count={isPending ? undefined : shown.length}
      description="An invite joins this server, not a channel."
      title="Invites"
      total={data?.length}
      toolbar={
        <ListToolbar
          filters={chips}
          onClear={clear}
          onSearchChange={setTerm}
          searchLabel="Search invites by code or creator @username"
          searchPlaceholder="Search invites"
          searchSuggest={suggestions}
          searchValue={term}
        >
          <FilterMenu
            label="Status"
            onChange={(next) => {
              setFilters({
                ...filters,
                status:
                  next[0] === "active"
                    ? "active"
                    : next[0] === "dead"
                      ? "dead"
                      : null,
              });
            }}
            options={[
              { value: "active", label: "Active" },
              { value: "dead", label: "Expired or used up" },
            ]}
            selected={filters.status === null ? [] : [filters.status]}
          />
          <FilterMenu
            label="Expiry"
            onChange={(next) => {
              setFilters({
                ...filters,
                expiry:
                  next[0] === "temporary"
                    ? "temporary"
                    : next[0] === "permanent"
                      ? "permanent"
                      : null,
              });
            }}
            options={[
              { value: "temporary", label: "Temporary" },
              { value: "permanent", label: "Never expires" },
            ]}
            selected={filters.expiry === null ? [] : [filters.expiry]}
          />
          <FilterMenu
            label="Creator"
            multiple
            onChange={(inviterIds) => {
              setFilters({ ...filters, inviterIds });
            }}
            options={inviterIds.map((userId) => ({
              value: userId,
              label: handleOf(userId),
              ...(nameOf(userId) === "" ? {} : { hint: nameOf(userId) }),
            }))}
            selected={filters.inviterIds}
          />
        </ListToolbar>
      }
    >
      {creating && mayCreate ? (
        <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border bg-muted/40 p-3">
          <Field className="w-32">
            <FieldLabel htmlFor={maxUsesId}>Maximum uses</FieldLabel>
            <Input
              className="h-8"
              id={maxUsesId}
              min={1}
              onChange={(event) => {
                setMaxUses(event.target.value);
              }}
              placeholder="Unlimited"
              type="number"
              value={maxUses}
            />
          </Field>
          <Field className="w-32">
            <FieldLabel htmlFor={expiresId}>Expires in (hours)</FieldLabel>
            <Input
              className="h-8"
              id={expiresId}
              min={1}
              onChange={(event) => {
                setExpiresInHours(event.target.value);
              }}
              placeholder="Never"
              type="number"
              value={expiresInHours}
            />
          </Field>
          <div className="flex items-center gap-2">
            <Button
              disabled={create.isPending}
              onClick={() => {
                create.mutate();
              }}
              size="sm"
            >
              {create.isPending ? "Creating…" : "Create and copy link"}
            </Button>
            <Button
              onClick={() => {
                setCreating(false);
              }}
              size="sm"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
          {create.error === null ? null : (
            <p className="w-full text-sm text-destructive" role="alert">
              {create.error instanceof ApiError
                ? create.error.message
                : "Could not create the invite"}
            </p>
          )}
        </div>
      ) : null}

      {revoke.error === null ? null : (
        <p className="mb-2 text-sm text-destructive" role="alert">
          {revoke.error instanceof ApiError
            ? revoke.error.message
            : "Could not revoke the invite"}
        </p>
      )}

      {isError ? (
        <ListError>Could not load this server&rsquo;s invites.</ListError>
      ) : isPending ? (
        <ListSkeleton rows={3} />
      ) : shown.length === 0 ? (
        narrowed ? (
          <NoMatches noun="invites" onClear={clear} />
        ) : (
          <NothingYet
            description={
              mayCreate
                ? "Create one and the link appears here, with who made it and when it stops working."
                : undefined
            }
            icon={<Link2 aria-hidden className="size-5" />}
            title="No open invites"
          />
        )
      ) : (
        <SettingsList
          className="grid grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]"
          label="Invites"
        >
          {shown.map((invite) => {
            const expiry = inviteExpiry(invite, now);
            const dead =
              expiry.state === "expired" || expiry.state === "exhausted";

            return (
              <li
                className="col-span-3 grid grid-cols-subgrid items-center gap-3 py-2.5 sm:col-span-5"
                key={invite.code}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <Truncated
                    className={cn(
                      "font-mono text-sm",
                      dead && "text-muted-foreground line-through",
                    )}
                    value={invite.code}
                  />

                  <Truncated
                    className="text-xs font-medium text-foreground/80"
                    value={handleOf(invite.inviterId)}
                  />
                </span>

                <span className="hidden text-right text-xs whitespace-nowrap text-muted-foreground sm:block">
                  {usage(invite)}
                </span>

                <span className="hidden flex-col items-end text-right text-xs whitespace-nowrap sm:flex">
                  <span className="text-muted-foreground">
                    Created {CREATED.format(new Date(invite.createdAt))}
                  </span>
                  <span
                    className={cn(
                      dead ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {expiry.label}
                  </span>
                </span>

                <Button
                  className="w-full"
                  disabled={dead}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(inviteUrl(invite.code))
                      .then(() => {
                        setCopied(invite.code);
                      })
                      .catch(() => undefined);
                  }}
                  size="xs"
                  variant="outline"
                >
                  {copied === invite.code ? "Copied" : "Copy link"}
                </Button>

                {mayRevoke(invite) ? (
                  <Button
                    aria-label={`Revoke invite ${invite.code}`}
                    className="w-full"
                    disabled={revoke.isPending}
                    onClick={() => {
                      revoke.mutate(invite.code);
                    }}
                    size="xs"
                    variant="ghost"
                  >
                    Revoke
                  </Button>
                ) : null}
              </li>
            );
          })}
        </SettingsList>
      )}
    </SettingsPage>
  );
}
