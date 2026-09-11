import { Permissions } from "@opencord/shared/permissions";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import {
  ANY_DATE,
  type DateRange,
  describeRange,
} from "@/components/data-list/date-range";
import { DateRangeFilter } from "@/components/data-list/date-range-filter";
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
import { matches, withinDays } from "@/components/data-list/matches";
import { MetaLine } from "@/components/data-list/meta-line";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Truncated } from "@/components/ui/truncated";
import { type BanEntry, serverBansQuery } from "@/features/members/api/queries";
import { useMemberMutations } from "@/features/members/hooks/use-member-mutations";
import {
  has,
  useServerPermissions,
} from "@/features/permissions/hooks/use-permissions";
import {
  SettingsList,
  SettingsPage,
} from "@/features/server-settings/components/settings-page";
import { useSettingsState } from "@/features/server-settings/lib/settings-state";
import { serverQuery } from "@/features/servers/api/queries";
import { userQuery } from "@/features/users/api/queries";
import { UserAvatar } from "@/features/users/components/user-avatar";
import { isHandleTerm, matchesIdentity, toHandle } from "@/lib/identity";
import { localDay } from "@/lib/local-day";

interface BanFilters {
  moderatorIds: string[];
  reason: "with" | "without" | null;
  date: DateRange;
}

const NO_BAN_FILTERS: BanFilters = {
  moderatorIds: [],
  reason: null,
  date: ANY_DATE,
};

const BANNED_AT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function BansPage({ serverId }: { serverId: string }) {
  const mutations = useMemberMutations(serverId);
  const permissions = useServerPermissions(serverId);

  const [term, setTerm] = useSettingsState("bans:search", "");
  const [filters, setFilters] = useSettingsState<BanFilters>(
    "bans:filters",
    NO_BAN_FILTERS,
  );
  const [confirming, setConfirming] = useState<BanEntry | null>(null);

  const { data, isPending, isError } = useQuery(serverBansQuery(serverId));
  const { isPending: resolving } = useQuery(serverQuery(serverId));

  const mayManage = has(permissions, Permissions.BAN_MEMBERS);
  const showUnban = !resolving && mayManage;

  const moderatorIds = [...new Set((data ?? []).map((ban) => ban.bannedBy))];

  const moderators = useQueries({
    queries: moderatorIds.map((userId) => userQuery(userId)),
    combine: (results) =>
      new Map(
        results.map((result, index) => [
          moderatorIds[index] ?? "",
          result.data ?? null,
        ]),
      ),
  });

  const handleOf = (userId: string) => {
    const moderator = moderators.get(userId);

    return moderator === null || moderator === undefined
      ? "an unknown moderator"
      : toHandle(moderator.username);
  };

  const suggestions = [
    ...(data ?? []).map((ban) => ({
      id: ban.user.id,
      username: ban.user.username,
      name: ban.user.name,
    })),
  ].filter((entry) => entry.username !== "");

  const shown = (data ?? []).filter((ban) => {
    if (
      filters.moderatorIds.length > 0 &&
      !filters.moderatorIds.includes(ban.bannedBy)
    ) {
      return false;
    }

    if (filters.reason === "with" && ban.reason === null) {
      return false;
    }

    if (filters.reason === "without" && ban.reason !== null) {
      return false;
    }

    if (
      !withinDays(localDay(ban.createdAt), filters.date.from, filters.date.to)
    ) {
      return false;
    }

    const moderator = moderators.get(ban.bannedBy);

    return (
      matchesIdentity(term, ban.user) ||
      (!isHandleTerm(term) &&
        (matches(term, ban.reason) ||
          (moderator !== null &&
            moderator !== undefined &&
            matchesIdentity(term, moderator)))) ||
      (isHandleTerm(term) &&
        moderator !== null &&
        moderator !== undefined &&
        matchesIdentity(term, moderator))
    );
  });

  const clear = () => {
    setTerm("");
    setFilters(NO_BAN_FILTERS);
  };

  const dateLabel = describeRange(filters.date);

  const chips: ActiveFilter[] = [
    ...filters.moderatorIds.map((userId) => ({
      id: `by:${userId}`,
      label: `Banned by: ${handleOf(userId)}`,
      onRemove: () => {
        setFilters({
          ...filters,
          moderatorIds: filters.moderatorIds.filter(
            (entry) => entry !== userId,
          ),
        });
      },
    })),
    ...(filters.reason === null
      ? []
      : [
          {
            id: "reason",
            label: filters.reason === "with" ? "Has a reason" : "No reason",
            onRemove: () => {
              setFilters({ ...filters, reason: null });
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
              setFilters({ ...filters, date: ANY_DATE });
            },
          },
        ]),
  ];

  const narrowed = term.trim() !== "" || chips.length > 0;

  return (
    <SettingsPage
      count={isPending ? undefined : shown.length}
      description="People who cannot rejoin until a ban is lifted."
      title="Bans"
      total={data?.length}
      toolbar={
        <ListToolbar
          filters={chips}
          onClear={clear}
          onSearchChange={setTerm}
          searchLabel="Search bans by @username, name or reason"
          searchPlaceholder="Search bans"
          searchSuggest={suggestions}
          searchValue={term}
        >
          <FilterMenu
            label="Banned by"
            multiple
            onChange={(moderatorIds) => {
              setFilters({ ...filters, moderatorIds });
            }}
            options={moderatorIds.map((userId) => ({
              value: userId,
              label: handleOf(userId),
              ...(moderators.get(userId)?.name === undefined
                ? {}
                : { hint: moderators.get(userId)?.name }),
            }))}
            selected={filters.moderatorIds}
          />
          <FilterMenu
            label="Reason"
            onChange={(next) => {
              setFilters({
                ...filters,
                reason:
                  next[0] === "with"
                    ? "with"
                    : next[0] === "without"
                      ? "without"
                      : null,
              });
            }}
            options={[
              { value: "with", label: "Has a reason" },
              { value: "without", label: "No reason given" },
            ]}
            selected={filters.reason === null ? [] : [filters.reason]}
          />
          <DateRangeFilter
            onChange={(date) => {
              setFilters({ ...filters, date });
            }}
            value={filters.date}
          />
        </ListToolbar>
      }
    >
      {mutations.error === null ? null : (
        <p className="mb-2 text-sm text-destructive" role="alert">
          {mutations.error}
        </p>
      )}

      {isError ? (
        <ListError>Could not load this server&rsquo;s bans.</ListError>
      ) : isPending ? (
        <ListSkeleton rows={3} />
      ) : shown.length === 0 ? (
        narrowed ? (
          <NoMatches noun="bans" onClear={clear} />
        ) : (
          <NothingYet
            description={
              showUnban
                ? "Ban somebody from the Members page and they appear here, with a way to lift it."
                : undefined
            }
            icon={<ShieldCheck aria-hidden className="size-5" />}
            title="This server has no banned users"
          />
        )
      ) : (
        <SettingsList label="Bans">
          {shown.map((ban) => (
            <li className="flex items-start gap-3 py-2.5" key={ban.user.id}>
              <UserAvatar
                avatarUrl={ban.user.avatarUrl}
                name={ban.user.name}
                size="sm"
                userId={ban.user.id}
              />

              <span className="flex min-w-0 flex-1 flex-col">
                <Truncated
                  className="text-sm font-medium"
                  value={
                    ban.user.name.trim() === ""
                      ? ban.user.username
                      : ban.user.name
                  }
                />
                <MetaLine>
                  <span className="font-medium text-foreground/80">
                    {ban.user.username === ""
                      ? "account removed"
                      : toHandle(ban.user.username)}
                  </span>
                  <span>banned by {handleOf(ban.bannedBy)}</span>
                  <span>{BANNED_AT.format(new Date(ban.createdAt))}</span>
                </MetaLine>
              </span>

              <span className="hidden min-w-0 flex-1 text-xs break-words text-muted-foreground sm:block">
                {ban.reason ?? <span className="italic">No reason given</span>}
              </span>

              {showUnban ? (
                <Button
                  aria-label={`Unban ${ban.user.name}`}
                  disabled={mutations.isPending}
                  onClick={() => {
                    setConfirming(ban);
                  }}
                  size="xs"
                  variant="outline"
                >
                  Unban
                </Button>
              ) : null}
            </li>
          ))}
        </SettingsList>
      )}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null);
          }
        }}
        open={confirming !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Lift the ban on {confirming?.user.name ?? "this person"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will be able to rejoin with an invite. They are not added
              back to the server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming !== null) {
                  mutations.unban(confirming.user.id);
                }

                setConfirming(null);
              }}
            >
              Unban
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsPage>
  );
}
