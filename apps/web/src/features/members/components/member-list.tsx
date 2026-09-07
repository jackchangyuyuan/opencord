import { Permissions } from "@opencord/shared/permissions";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import type { CSSProperties } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpenDm } from "@/features/dms/api/queries";
import {
  displayName,
  type ServerMemberEntry,
  serverMembersQuery,
} from "@/features/members/api/queries";
import { MemberActions } from "@/features/members/components/member-actions";
import { PresenceDot } from "@/features/members/components/presence-dot";
import {
  has,
  outranks,
  useServerPermissions,
} from "@/features/permissions/hooks/use-permissions";
import {
  type PublicRole,
  roleColor,
  serverRolesQuery,
} from "@/features/roles/api/queries";
import { serverQuery } from "@/features/servers/api/queries";
import { currentUserQuery } from "@/features/users/api/queries";
import { statusOf, usePresence } from "@/stores/presence";

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
  const { data: me } = useQuery(currentUserQuery);
  const permissions = useServerPermissions(serverId);
  const presence = usePresence((state) => state.byUser);
  const { openDm } = useOpenDm();

  const mayModerate =
    has(permissions, Permissions.KICK_MEMBERS) ||
    has(permissions, Permissions.MANAGE_ROLES);

  const actor = {
    id: me?.id,
    roleIds: server.data?.roles.map((role) => role.id) ?? [],
  };

  if (!enabled || members.isPending || roles.isPending) {
    return (
      <div aria-hidden className="flex flex-col gap-2 p-3">
        {["a", "b", "c", "d"].map((key) => (
          <div className="flex items-center gap-2" key={key}>
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-3 flex-1" />
          </div>
        ))}
      </div>
    );
  }

  if (members.isError || roles.isError) {
    return (
      <p className="p-4 text-sm text-muted-foreground" role="alert">
        Could not load members.
      </p>
    );
  }

  const byId = new Map(roles.data.map((role) => [role.id, role]));
  const everyone = members.data.pages.flatMap((page) => page.data);
  const groups = group(everyone, roles.data);

  return (
    <div className="flex flex-col gap-4 p-3">
      {groups.map(({ role, members: entries }) => (
        <section aria-labelledby={`member-group-${role.id}`} key={role.id}>
          <h3
            className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            id={`member-group-${role.id}`}
          >
            {role.name} — {entries.length}
          </h3>
          <ul className="flex flex-col gap-1">
            {entries.map((member) => (
              <li
                className="flex items-center gap-2"
                key={member.user.id}
                style={
                  {
                    "--member-color": roleColor(
                      highestColouredRole(member, byId),
                    ),
                  } as CSSProperties
                }
              >
                <span className="relative shrink-0">
                  <Avatar aria-hidden className="size-7">
                    <AvatarImage
                      alt=""
                      src={member.user.avatarUrl ?? undefined}
                    />
                    <AvatarFallback>
                      {displayName(member).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -right-0.5 -bottom-0.5">
                    <PresenceDot status={statusOf(presence, member.user.id)} />
                  </span>
                </span>
                <span className="role-color flex-1 truncate text-sm">
                  {displayName(member)}
                </span>
                {member.user.id === actor.id ? null : (
                  <Button
                    aria-label={`Message ${displayName(member)}`}
                    onClick={() => {
                      openDm(member.user.id);
                    }}
                    size="icon-xs"
                    variant="ghost"
                  >
                    <MessageSquare />
                  </Button>
                )}
                {mayModerate ? (
                  <MemberActions
                    canAct={outranks(
                      actor,
                      member,
                      roles.data,
                      server.data?.ownerId,
                    )}
                    member={member}
                    permissions={permissions}
                    roles={roles.data}
                    serverId={serverId}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {members.hasNextPage ? (
        <Button
          disabled={members.isFetchingNextPage}
          onClick={() => void members.fetchNextPage()}
          size="sm"
          variant="ghost"
        >
          {members.isFetchingNextPage ? "Loading…" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}
