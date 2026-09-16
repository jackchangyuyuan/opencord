import type { PresenceStatus } from "@opencord/shared/types";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Crown, Users } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";

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
  displayName,
  type ServerMemberEntry,
  serverMembersQuery,
} from "@/features/members/api/queries";
import { MemberActions } from "@/features/members/components/member-actions";
import { PresenceDot } from "@/features/members/components/presence-dot";
import {
  filterMembers,
  type MemberFilters,
  memberFiltersActive,
  NO_MEMBER_FILTERS,
  RECENT_WINDOWS,
} from "@/features/members/lib/member-filters";
import {
  outranks,
  useServerPermissions,
} from "@/features/permissions/hooks/use-permissions";
import {
  roleColor,
  serverRolesQuery,
  type ServerRoleSummary,
} from "@/features/roles/api/queries";
import {
  SettingsList,
  SettingsPage,
} from "@/features/server-settings/components/settings-page";
import { useSettingsState } from "@/features/server-settings/lib/settings-state";
import { serverQuery } from "@/features/servers/api/queries";
import { currentUserQuery } from "@/features/users/api/queries";
import { UserAvatar } from "@/features/users/components/user-avatar";
import { UserProfilePopover } from "@/features/users/components/user-profile-popover";
import { bareTerm, matchesIdentity, toHandle } from "@/lib/identity";
import { useClipped } from "@/lib/use-clipped";
import { PRESENCE_LABEL, statusOf, usePresence } from "@/stores/presence";

const AUTO_PAGES = 10;

const STATUSES: PresenceStatus[] = ["online", "idle", "dnd", "offline"];

function isStatus(value: string): value is PresenceStatus {
  return STATUSES.some((status) => status === value);
}

const JOINED = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function colorOf(held: readonly ServerRoleSummary[]): string | undefined {
  return roleColor(
    held
      .filter((role) => roleColor(role) !== undefined)
      .sort((a, b) => b.position - a.position)[0],
  );
}

export function MembersPage({ serverId }: { serverId: string }) {
  const permissions = useServerPermissions(serverId);
  const byUser = usePresence((state) => state.byUser);

  const [term, setTerm] = useSettingsState("members:search", "");
  const [filters, setFilters] = useSettingsState<MemberFilters>(
    "members:filters",
    NO_MEMBER_FILTERS,
  );

  const [debounced, setDebounced] = useState(term);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(term);
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [term]);

  const members = useInfiniteQuery(
    serverMembersQuery(serverId, bareTerm(debounced)),
  );
  const { data: roles } = useQuery(serverRolesQuery(serverId));
  const { data: server } = useQuery(serverQuery(serverId));
  const { data: me } = useQuery(currentUserQuery);

  const pages = members.data?.pages.length ?? 0;
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = members;

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && pages < AUTO_PAGES) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, pages]);

  const everyone = useMemo(
    () => members.data?.pages.flatMap((page) => page.data) ?? [],
    [members.data],
  );

  const searched = everyone.filter((member) =>
    matchesIdentity(term, {
      username: member.user.username,
      name: member.user.name,
      nickname: member.nickname,
    }),
  );

  const shown = filterMembers({
    filters,
    members: searched,
    ownerId: server?.ownerId,
    roles: roles ?? [],
    statusOf: (userId) => statusOf(byUser, userId),
  });

  const assignable = (roles ?? []).filter((role) => !role.isDefault);

  const clear = () => {
    setTerm("");
    setFilters(NO_MEMBER_FILTERS);
  };

  const chips: ActiveFilter[] = [
    ...filters.roleIds.map((roleId) => ({
      id: `role:${roleId}`,
      label: `Role: ${roles?.find((role) => role.id === roleId)?.name ?? "Unknown"}`,
      onRemove: () => {
        setFilters({
          ...filters,
          roleIds: filters.roleIds.filter((entry) => entry !== roleId),
        });
      },
    })),
    ...filters.statuses.map((status) => ({
      id: `status:${status}`,
      label: `Status: ${PRESENCE_LABEL[status]}`,
      onRemove: () => {
        setFilters({
          ...filters,
          statuses: filters.statuses.filter((entry) => entry !== status),
        });
      },
    })),
    ...(filters.owner
      ? [
          {
            id: "owner",
            label: "Server owner",
            onRemove: () => {
              setFilters({ ...filters, owner: false });
            },
          },
        ]
      : []),
    ...(filters.admin
      ? [
          {
            id: "admin",
            label: "Administrator",
            onRemove: () => {
              setFilters({ ...filters, admin: false });
            },
          },
        ]
      : []),
    ...(filters.guest
      ? [
          {
            id: "guest",
            label: "Guest account",
            onRemove: () => {
              setFilters({ ...filters, guest: false });
            },
          },
        ]
      : []),
    ...(filters.joined === null
      ? []
      : [
          {
            id: "joined",
            label:
              RECENT_WINDOWS.find((entry) => entry.value === filters.joined)
                ?.label ?? "Joined recently",
            onRemove: () => {
              setFilters({ ...filters, joined: null });
            },
          },
        ]),
  ];

  const extras =
    (filters.owner ? 1 : 0) +
    (filters.admin ? 1 : 0) +
    (filters.guest ? 1 : 0) +
    (filters.joined === null ? 0 : 1);

  const narrowed = term.trim() !== "" || memberFiltersActive(filters);

  const suggestions = everyone.map((member) => ({
    id: member.user.id,
    username: member.user.username,
    name: member.user.name,
  }));

  const total = roles?.find((role) => role.isDefault)?.memberCount;

  const myRoleIds = (server?.viewerRoles ?? []).map((role) => role.id);

  return (
    <SettingsPage
      count={members.isPending ? undefined : shown.length}
      description="Everyone who has joined, and what they may do here."
      title="Members"
      total={total}
      toolbar={
        <ListToolbar
          filters={chips}
          onClear={clear}
          onSearchChange={setTerm}
          searchLabel="Search members by @username or name"
          searchPlaceholder="Search members"
          searchSuggest={suggestions}
          searchValue={term}
        >
          <FilterMenu
            label="Roles"
            multiple
            onChange={(roleIds) => {
              setFilters({ ...filters, roleIds });
            }}
            options={assignable.map((role) => {
              const swatch = roleColor(role);

              return {
                value: role.id,
                label: role.name,
                hint: String(role.memberCount),
                ...(swatch === undefined ? {} : { swatch }),
              };
            })}
            selected={filters.roleIds}
          />
          <FilterMenu
            label="Status"
            multiple
            onChange={(next) => {
              setFilters({ ...filters, statuses: next.filter(isStatus) });
            }}
            options={STATUSES.map((status) => ({
              value: status,
              label: PRESENCE_LABEL[status],
            }))}
            selected={filters.statuses}
          />
          <MoreFilters count={extras}>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Standing</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={filters.owner}
                closeOnClick={false}
                onCheckedChange={(owner) => {
                  setFilters({ ...filters, owner });
                }}
              >
                Server owner
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={filters.admin}
                closeOnClick={false}
                onCheckedChange={(admin) => {
                  setFilters({ ...filters, admin });
                }}
              >
                Administrator
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={filters.guest}
                closeOnClick={false}
                onCheckedChange={(guest) => {
                  setFilters({ ...filters, guest });
                }}
              >
                Guest account
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Joined</DropdownMenuLabel>
              {RECENT_WINDOWS.map((entry) => (
                <DropdownMenuCheckboxItem
                  checked={filters.joined === entry.value}
                  closeOnClick={false}
                  key={entry.value}
                  onCheckedChange={(on) => {
                    setFilters({ ...filters, joined: on ? entry.value : null });
                  }}
                >
                  {entry.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </MoreFilters>
        </ListToolbar>
      }
    >
      {members.isError ? (
        <ListError>Could not load this server&rsquo;s members.</ListError>
      ) : members.isPending ? (
        <ListSkeleton />
      ) : shown.length === 0 ? (
        narrowed ? (
          <NoMatches noun="members" onClear={clear} />
        ) : (
          <NothingYet
            description="Invite somebody and they appear here."
            icon={<Users aria-hidden className="size-5" />}
            title="Nobody else is here yet"
          />
        )
      ) : (
        <>
          <SettingsList
            className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_auto_auto]"
            label="Members"
          >
            {shown.map((member) => {
              const held = (roles ?? []).filter((role) =>
                member.roleIds.includes(role.id),
              );

              return (
                <li
                  className="col-span-2 grid grid-cols-subgrid items-center gap-3 py-2 sm:col-span-4"
                  key={member.user.id}
                >
                  <MemberCell
                    isServerOwner={member.user.id === server?.ownerId}
                    member={member}
                    serverId={serverId}
                    status={statusOf(byUser, member.user.id)}
                    tint={colorOf(held)}
                  />

                  <span className="hidden min-w-0 items-center justify-end gap-1 sm:flex">
                    {held.length === 0 ? (
                      <span className="text-micro text-muted-foreground">
                        No roles
                      </span>
                    ) : null}
                    {held.slice(0, 2).map((role) => {
                      const swatch = roleColor(role);

                      return (
                        <span
                          className="inline-flex max-w-28 items-center gap-1 rounded-full border px-1.5 py-0.5 text-micro"
                          key={role.id}
                        >
                          <span
                            aria-hidden
                            className="size-1.5 shrink-0 rounded-full bg-current"
                            style={{ color: swatch ?? "currentColor" }}
                          />
                          <span className="truncate">{role.name}</span>
                        </span>
                      );
                    })}
                    {held.length > 2 ? (
                      <span className="text-micro text-muted-foreground">
                        +{held.length - 2}
                      </span>
                    ) : null}
                  </span>

                  <span className="hidden text-right text-xs whitespace-nowrap text-muted-foreground sm:block">
                    Joined {JOINED.format(new Date(member.joinedAt))}
                  </span>

                  <span className="flex justify-end">
                    {outranks(
                      { id: me?.id, roleIds: myRoleIds },
                      member,
                      roles ?? [],
                      server?.ownerId,
                    ) ? (
                      <MemberActions
                        member={member}
                        permissions={permissions}
                        roles={roles ?? []}
                        serverId={serverId}
                      />
                    ) : null}
                  </span>
                </li>
              );
            })}
          </SettingsList>

          {hasNextPage ? (
            <Button
              className="mt-3 self-start"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
              size="sm"
              variant="outline"
            >
              {isFetchingNextPage ? "Loading…" : "Load more members"}
            </Button>
          ) : null}
        </>
      )}
    </SettingsPage>
  );
}

function MemberCell({
  isServerOwner,
  member,
  serverId,
  status,
  tint,
}: {
  isServerOwner: boolean;
  member: ServerMemberEntry;
  serverId: string;
  status: PresenceStatus;
  tint: string | undefined;
}) {
  const name = displayName(member);
  const at = toHandle(member.user.username);
  const clippedName = useClipped<HTMLSpanElement>();
  const clippedHandle = useClipped<HTMLSpanElement>();

  const full = [
    clippedName.clipped ? name : null,
    clippedHandle.clipped ? at : null,
  ].filter((line) => line !== null);

  return (
    <UserProfilePopover
      className="flex min-w-0 items-center gap-3 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      label={
        isServerOwner ? `${name}'s profile, server owner` : `${name}'s profile`
      }
      serverId={serverId}
      userId={member.user.id}
      {...(full.length === 0 ? {} : { tooltip: full.join(" · ") })}
    >
      <span className="relative shrink-0">
        <UserAvatar
          avatarUrl={member.user.avatarUrl}
          name={name}
          showPresence={false}
          size="sm"
          userId={member.user.id}
        />
        <PresenceDot
          className="absolute -right-0.5 -bottom-0.5 ring-2 ring-popover"
          status={status}
        />
      </span>

      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className="role-color min-w-0"
            style={
              tint === undefined
                ? undefined
                : ({ "--member-color": tint } as CSSProperties)
            }
          >
            <span
              className="block min-w-0 truncate text-sm font-medium"
              ref={clippedName.ref}
            >
              {name}
            </span>
          </span>
          {isServerOwner ? (
            <Crown
              aria-label="Server owner"
              className="size-3.5 shrink-0 text-amber-500 dark:text-amber-400"
              role="img"
            />
          ) : null}
          {member.user.isGuest ? (
            <span className="shrink-0 rounded-full border px-1.5 text-micro text-muted-foreground">
              Guest
            </span>
          ) : null}
        </span>

        <span
          className="block min-w-0 truncate text-xs text-muted-foreground"
          ref={clippedHandle.ref}
        >
          {at}
        </span>
      </span>
    </UserProfilePopover>
  );
}
