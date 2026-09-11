import type { AuditTargetGroup } from "@opencord/shared/constants";
import { Permissions } from "@opencord/shared/permissions";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { useEffect, useState } from "react";

import { describeRange } from "@/components/data-list/date-range";
import { DateRangeFilter } from "@/components/data-list/date-range-filter";
import { FilterMenu, MoreFilters } from "@/components/data-list/filter-menu";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  auditFiltersActive,
  type AuditLogEntry,
  type AuditLogFilters,
  auditLogQuery,
  auditPeopleQuery,
  NO_AUDIT_FILTERS,
} from "@/features/audit-log/api/queries";
import { AuditEntry } from "@/features/audit-log/components/audit-entry";
import {
  AUDIT_ACTION_GROUPS,
  AUDIT_ACTION_LABEL,
} from "@/features/audit-log/lib/describe";
import { serverChannelsQuery } from "@/features/channels/api/queries";
import {
  has,
  useServerPermissions,
} from "@/features/permissions/hooks/use-permissions";
import { serverRolesQuery } from "@/features/roles/api/queries";
import { SettingsPage } from "@/features/server-settings/components/settings-page";
import { useSettingsState } from "@/features/server-settings/lib/settings-state";
import { bareTerm, toHandle } from "@/lib/identity";

const TARGETS: { value: AuditTargetGroup; label: string }[] = [
  { value: "member", label: "A member" },
  { value: "role", label: "A role" },
  { value: "channel", label: "A channel" },
  { value: "invite", label: "An invite" },
  { value: "message", label: "A message" },
  { value: "server", label: "The server" },
];

function isTarget(value: string): value is AuditTargetGroup {
  return TARGETS.some((entry) => entry.value === value);
}

function channelIdOf(entry: AuditLogEntry): string | null {
  if (entry.targetType === "channel") {
    return entry.targetId;
  }

  const value =
    typeof entry.metadata === "object" && entry.metadata !== null
      ? (entry.metadata as Record<string, unknown>)["channelId"]
      : undefined;

  return typeof value === "string" ? value : null;
}

function roleIdOf(entry: AuditLogEntry): string | null {
  const value =
    typeof entry.metadata === "object" && entry.metadata !== null
      ? (entry.metadata as Record<string, unknown>)["roleId"]
      : undefined;

  return typeof value === "string" ? value : null;
}

export function AuditLogPage({ serverId }: { serverId: string }) {
  const permissions = useServerPermissions(serverId);
  const mayRead = has(permissions, Permissions.MANAGE_SERVER);

  const [filters, setFilters] = useSettingsState<AuditLogFilters>(
    "audit:filters",
    NO_AUDIT_FILTERS,
  );

  const [debounced, setDebounced] = useState(filters.q);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(filters.q);
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [filters.q]);

  const entries = useInfiniteQuery({
    ...auditLogQuery(serverId, { ...filters, q: bareTerm(debounced) }),
    enabled: mayRead,
  });

  const { data: people } = useQuery({
    ...auditPeopleQuery(serverId),
    enabled: mayRead,
  });

  const actors = people?.filter((person) => person.isActor);

  const { data: roles } = useQuery({
    ...serverRolesQuery(serverId),
    enabled: mayRead,
  });
  const { data: channels } = useQuery({
    ...serverChannelsQuery(serverId),
    enabled: mayRead,
  });

  const nameOf = (
    entry: AuditLogEntry,
    kind: "channel" | "role",
  ): string | null => {
    const snapshot =
      typeof entry.metadata === "object" &&
      entry.metadata !== null &&
      typeof (entry.metadata as Record<string, unknown>)["name"] === "string"
        ? ((entry.metadata as Record<string, unknown>)["name"] as string)
        : null;

    const id =
      kind === "channel"
        ? channelIdOf(entry)
        : entry.targetType === "role"
          ? entry.targetId
          : roleIdOf(entry);

    const live =
      id === null
        ? null
        : kind === "channel"
          ? (channels?.find((channel) => channel.id === id)?.name ?? null)
          : (roles?.find((role) => role.id === id)?.name ?? null);

    return live ?? snapshot;
  };

  if (!mayRead) {
    return null;
  }

  const clear = () => {
    setFilters(NO_AUDIT_FILTERS);
  };

  const actorHandle = (userId: string) => {
    const actor = actors?.find((entry) => entry.id === userId);

    return actor === undefined
      ? "an unknown account"
      : toHandle(actor.username);
  };

  const dateLabel = describeRange({ from: filters.from, to: filters.to });

  const chips: ActiveFilter[] = [
    ...filters.action.map((action) => ({
      id: `action:${action}`,
      label: AUDIT_ACTION_LABEL[action],
      onRemove: () => {
        setFilters({
          ...filters,
          action: filters.action.filter((entry) => entry !== action),
        });
      },
    })),
    ...(filters.actorId === null
      ? []
      : [
          {
            id: "actor",
            label: `By ${actorHandle(filters.actorId)}`,
            onRemove: () => {
              setFilters({ ...filters, actorId: null });
            },
          },
        ]),
    ...(filters.target === null
      ? []
      : [
          {
            id: "target",
            label: `About ${
              TARGETS.find((entry) => entry.value === filters.target)?.label ??
              filters.target
            }`,
            onRemove: () => {
              setFilters({ ...filters, target: null });
            },
          },
        ]),
    ...(dateLabel === null
      ? []
      : [
          {
            id: "date",
            label: `Date: ${dateLabel}`,
            onRemove: () => {
              setFilters({ ...filters, from: null, to: null });
            },
          },
        ]),
  ];

  const rows = entries.data?.pages.flatMap((page) => page.data) ?? [];
  const narrowed = auditFiltersActive(filters);

  return (
    <SettingsPage
      description="Written automatically. Only Manage server can read it."
      title="Audit log"
      toolbar={
        <ListToolbar
          filters={chips}
          onClear={clear}
          onSearchChange={(q) => {
            setFilters({ ...filters, q });
          }}
          searchLabel="Search the record by @username, as actor or target"
          searchPlaceholder="Search the record"
          searchSuggest={people ?? []}
          searchValue={filters.q}
        >
          <MoreFilters count={filters.action.length} label="Action">
            {AUDIT_ACTION_GROUPS.map((group, index) => (
              <DropdownMenuGroup key={group.label}>
                {index === 0 ? null : <DropdownMenuSeparator />}
                <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                {group.actions.map((action) => (
                  <DropdownMenuCheckboxItem
                    checked={filters.action.includes(action)}
                    closeOnClick={false}
                    key={action}
                    onCheckedChange={(on) => {
                      setFilters({
                        ...filters,
                        action: on
                          ? [...filters.action, action]
                          : filters.action.filter((entry) => entry !== action),
                      });
                    }}
                  >
                    {AUDIT_ACTION_LABEL[action]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </MoreFilters>

          <FilterMenu
            label="Actor"
            onChange={(next) => {
              setFilters({ ...filters, actorId: next[0] ?? null });
            }}
            options={(actors ?? []).map((actor) => ({
              value: actor.id,
              label: toHandle(actor.username),
              hint: actor.name,
            }))}
            selected={filters.actorId === null ? [] : [filters.actorId]}
          />

          <FilterMenu
            label="Target"
            onChange={(next) => {
              const [first] = next;

              setFilters({
                ...filters,
                target: first !== undefined && isTarget(first) ? first : null,
              });
            }}
            options={TARGETS}
            selected={filters.target === null ? [] : [filters.target]}
          />

          <DateRangeFilter
            onChange={(range) => {
              setFilters({ ...filters, from: range.from, to: range.to });
            }}
            value={{ from: filters.from, to: filters.to }}
          />
        </ListToolbar>
      }
    >
      {entries.isError ? (
        <ListError>Could not load this server&rsquo;s audit log.</ListError>
      ) : entries.isPending ? (
        <ListSkeleton rows={6} />
      ) : rows.length === 0 ? (
        narrowed ? (
          <NoMatches noun="entries" onClear={clear} />
        ) : (
          <NothingYet
            description="Kicks, bans, role changes, invites and deletions are recorded here."
            icon={<ScrollText aria-hidden className="size-5" />}
            title="Nothing has happened yet"
          />
        )
      ) : (
        <>
          <ul className="flex flex-col">
            {rows.map((entry) => (
              <AuditEntry
                channelName={nameOf(entry, "channel")}
                entry={entry}
                key={entry.id}
                roleName={nameOf(entry, "role")}
              />
            ))}
          </ul>

          {entries.hasNextPage ? (
            <Button
              className="mt-3 self-start"
              disabled={entries.isFetchingNextPage}
              onClick={() => void entries.fetchNextPage()}
              size="sm"
              variant="outline"
            >
              {entries.isFetchingNextPage ? "Loading…" : "Show more"}
            </Button>
          ) : null}
        </>
      )}
    </SettingsPage>
  );
}
