import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Crown, Users } from "lucide-react";
import type { CSSProperties } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  displayName,
  type ServerMemberEntry,
  serverMembersQuery,
} from "@/features/members/api/queries";
import { MemberIdentity } from "@/features/members/components/member-identity";
import {
  type PublicRole,
  roleColor,
  serverRolesQuery,
} from "@/features/roles/api/queries";
import { serverQuery } from "@/features/servers/api/queries";
import { UserAvatar } from "@/features/users/components/user-avatar";
import { UserProfilePopover } from "@/features/users/components/user-profile-popover";

interface Group {
  role: PublicRole;
  members: ServerMemberEntry[];
}

function highestRole(
  member: ServerMemberEntry,
  byId: Map<string, PublicRole>,
): PublicRole | undefined {
  return member.roleIds
    .map((roleId) => byId.get(roleId))
    .filter((role): role is PublicRole => role !== undefined && !role.isDefault)
    .sort((a, b) => b.position - a.position)[0];
}

function highestColouredRole(
  member: ServerMemberEntry,
  byId: Map<string, PublicRole>,
): PublicRole | undefined {
  return member.roleIds
    .map((roleId) => byId.get(roleId))
    .filter(
      (role): role is PublicRole =>
        role !== undefined && roleColor(role) !== undefined,
    )
    .sort((a, b) => b.position - a.position)[0];
}

function group(members: ServerMemberEntry[], roles: PublicRole[]): Group[] {
  const byId = new Map(roles.map((role) => [role.id, role]));
  const everyone = roles.find((role) => role.isDefault);
  const groups = new Map<string, Group>();

  for (const member of members) {
    const role = highestRole(member, byId) ?? everyone;

    if (role === undefined) {
      continue;
    }

    const existing = groups.get(role.id);

    if (existing === undefined) {
      groups.set(role.id, { role, members: [member] });
    } else {
      existing.members.push(member);
    }
  }

  return [...groups.values()].sort((a, b) => b.role.position - a.role.position);
}

export function MemberList({ serverId }: { serverId: string | undefined }) {
  const enabled = serverId !== undefined;

  const members = useInfiniteQuery({
    ...serverMembersQuery(serverId ?? ""),
    enabled,
  });

  const roles = useQuery({ ...serverRolesQuery(serverId ?? ""), enabled });
  const server = useQuery({ ...serverQuery(serverId ?? ""), enabled });

  if (!enabled) {
    return (
      <EmptyState
        description="Open a channel and the people who can read it appear here."
        icon={<Users aria-hidden className="size-5" />}
        title="No server open"
      />
    );
  }

  if (members.isPending || roles.isPending) {
    return (
      <div aria-hidden className="flex flex-col gap-3 p-5">
        {["a", "b", "c", "d", "e", "f"].map((key, index) => (
          <div
            className="flex items-center gap-3"
            key={key}
            style={{ opacity: 1 - index * 0.13 }}
          >
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-3.5 flex-1" />
          </div>
        ))}
      </div>
    );
  }

  if (members.isError || roles.isError) {
    return (
      <p className="p-4 text-body text-muted-foreground" role="alert">
        Could not load members.
      </p>
    );
  }

  const byId = new Map(roles.data.map((role) => [role.id, role]));
  const everyone = members.data.pages.flatMap((page) => page.data);
  const groups = group(everyone, roles.data);

  return (
    <div className="flex flex-col p-2 pt-4 pb-3">
      <div className="flex flex-col gap-6">
        {groups.map(({ role, members: entries }) => (
          <section aria-labelledby={`member-group-${role.id}`} key={role.id}>
            <h3
              className="mb-2 px-3 text-micro font-semibold tracking-[0.1em] text-muted-foreground uppercase"
              id={`member-group-${role.id}`}
            >
              {role.name}{" "}
              <span className="font-normal tabular-nums">{entries.length}</span>
            </h3>
            <ul className="flex flex-col gap-0.5">
              {entries.map((member) => (
                <li
                  className="group/member flex items-center gap-2 rounded-xl px-3 py-1.5 transition-colors duration-100 hover:bg-accent/60"
                  key={member.user.id}
                  style={
                    {
                      "--member-color": roleColor(
                        highestColouredRole(member, byId),
                      ),
                    } as CSSProperties
                  }
                >
                  <UserProfilePopover
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                    label={
                      member.user.id === server.data?.ownerId
                        ? `${displayName(member)}'s profile, server owner`
                        : `${displayName(member)}'s profile`
                    }
                    serverId={serverId}
                    side="left"
                    userId={member.user.id}
                  >
                    <UserAvatar
                      avatarUrl={member.user.avatarUrl}
                      name={displayName(member)}
                      size="sm"
                      userId={member.user.id}
                    />
                    <MemberIdentity
                      customStatus={member.user.customStatus}
                      customStatusEmoji={member.user.customStatusEmoji}
                      name={displayName(member)}
                    />

                    <span
                      aria-hidden={member.user.id !== server.data?.ownerId}
                      className="flex w-4 shrink-0 items-center justify-end"
                      data-testid="member-badge"
                    >
                      {member.user.id === server.data?.ownerId ? (
                        <Crown
                          aria-label="Server owner"
                          className="size-4 text-amber-500 dark:text-amber-400"
                          role="img"
                        >
                          <title>Server owner</title>
                        </Crown>
                      ) : null}
                    </span>
                  </UserProfilePopover>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {members.hasNextPage ? (
        <Button
          className="mt-3 w-full"
          disabled={members.isFetchingNextPage}
          onClick={() => void members.fetchNextPage()}
          size="sm"
          variant="outline"
        >
          {members.isFetchingNextPage ? "Loading…" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}
