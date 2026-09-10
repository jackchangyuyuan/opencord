import { Permissions } from "@opencord/shared/permissions";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Truncated } from "@/components/ui/truncated";
import { useOpenDm } from "@/features/dms/api/queries";
import { serverMemberQuery } from "@/features/members/api/queries";
import { MemberActions } from "@/features/members/components/member-actions";
import {
  has,
  outranks,
  useServerPermissions,
} from "@/features/permissions/hooks/use-permissions";
import { StatusPicker } from "@/features/realtime/components/status-picker";
import { serverRolesQuery } from "@/features/roles/api/queries";
import { serverQuery } from "@/features/servers/api/queries";
import { currentUserQuery, userQuery } from "@/features/users/api/queries";
import { RoleChips } from "@/features/users/components/role-chips";
import { UserAvatar } from "@/features/users/components/user-avatar";
import { useUserPresence } from "@/features/users/hooks/use-user-presence";
import { rolesOf } from "@/features/users/lib/roles";
import { PRESENCE_LABEL } from "@/stores/presence";
import { useUi } from "@/stores/ui";

export function UserProfileCard({
  userId,
  onEdit,
  serverId,
}: {
  userId: string;
  onEdit?: () => void;
  serverId?: string | undefined;
}) {
  const { data: me } = useQuery(currentUserQuery);
  const { data, isPending, isError } = useQuery(userQuery(userId));
  const status = useUserPresence(userId);
  const openModal = useUi((state) => state.openModal);
  const { openDm, isPending: opening } = useOpenDm();

  const inServer = serverId !== undefined;
  const permissions = useServerPermissions(serverId);

  const { data: member } = useQuery({
    ...serverMemberQuery(serverId ?? "", userId),
    enabled: inServer,
  });
  const { data: roles } = useQuery({
    ...serverRolesQuery(serverId ?? ""),
    enabled: inServer,
  });
  const { data: server } = useQuery({
    ...serverQuery(serverId ?? ""),
    enabled: inServer,
  });

  if (isPending) {
    return (
      <div aria-hidden className="flex flex-col gap-3">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-body text-muted-foreground" role="alert">
        Could not load that profile.
      </p>
    );
  }

  const mine = data.id === me?.id;
  const held = member === undefined ? [] : rolesOf(member.roleIds, roles ?? []);

  const assignable = (roles ?? []).filter((role) => !role.isDefault);

  const permitted =
    (has(permissions, Permissions.MANAGE_ROLES) && assignable.length > 0) ||
    has(permissions, Permissions.KICK_MEMBERS) ||
    has(permissions, Permissions.BAN_MEMBERS);

  const mayModerate =
    !mine &&
    member !== undefined &&
    roles !== undefined &&
    permitted &&
    outranks(
      { id: me?.id, roleIds: server?.roles.map((role) => role.id) ?? [] },
      member,
      roles,
      server?.ownerId,
    );

  return (
    <div className="flex flex-col gap-3">
      <UserAvatar
        avatarUrl={data.avatarUrl}
        name={data.name}
        ring="ring-popover"
        size="xl"
        userId={data.id}
      />

      <div className="flex min-w-0 flex-col gap-0.5">
        <Truncated
          className="text-lg leading-tight font-semibold"
          value={data.name}
        />
        <Truncated
          className="text-meta text-muted-foreground"
          value={`@${data.username}`}
        />
      </div>

      {mine ? (
        <StatusPicker className="-ml-1.5 self-start" />
      ) : (
        <p className="flex min-w-0 items-baseline gap-1.5 text-meta text-muted-foreground">
          <span>{PRESENCE_LABEL[status]}</span>
        </p>
      )}

      {data.customStatus === null && data.customStatusEmoji === null ? null : (
        <p className="min-w-0 text-meta wrap-anywhere text-foreground">
          {data.customStatusEmoji === null ? null : (
            <span className="mr-1">{data.customStatusEmoji}</span>
          )}
          {data.customStatus}
        </p>
      )}

      {data.description === null ? null : (
        <div className="flex flex-col gap-1 border-t pt-2.5">
          <h3 className="text-micro font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            About
          </h3>
          <p className="text-body wrap-anywhere whitespace-pre-line">
            {data.description}
          </p>
        </div>
      )}

      <RoleChips roles={held} />

      {mine ? (
        <Button
          className="mt-0.5 self-start"
          onClick={() => {
            onEdit?.();
            openModal("profile");
          }}
          size="sm"
          variant="outline"
        >
          <Pencil />
          Edit profile
        </Button>
      ) : (
        <div className="mt-0.5 flex items-center gap-1.5">
          <Button
            disabled={opening}
            onClick={() => {
              onEdit?.();
              openDm(data.id);
            }}
            size="sm"
          >
            <MessageSquare />
            Message
          </Button>
          {mayModerate && serverId !== undefined ? (
            <MemberActions
              member={member}
              permissions={permissions}
              roles={roles}
              serverId={serverId}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
