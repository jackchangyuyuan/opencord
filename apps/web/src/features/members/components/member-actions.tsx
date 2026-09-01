import { Permissions } from "@opencord/shared/permissions";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";

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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  displayName,
  type ServerMemberEntry,
} from "@/features/members/api/queries";
import { useMemberMutations } from "@/features/members/hooks/use-member-mutations";
import { has } from "@/features/permissions/hooks/use-permissions";
import type { PublicRole } from "@/features/roles/api/queries";

type Confirming = "kick" | "ban" | null;

export function MemberActions({
  canAct,
  member,
  permissions,
  roles,
  serverId,
}: {
  canAct: boolean;
  member: ServerMemberEntry;
  permissions: number;
  roles: readonly PublicRole[];
  serverId: string;
}) {
  const mutations = useMemberMutations(serverId);

  const [confirming, setConfirming] = useState<Confirming>(null);
  const [reason, setReason] = useState("");

  const name = displayName(member);

  const mayManageRoles = canAct && has(permissions, Permissions.MANAGE_ROLES);
  const mayKick = canAct && has(permissions, Permissions.KICK_MEMBERS);
  const mayBan = canAct && has(permissions, Permissions.BAN_MEMBERS);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Member actions for ${name}`}
          disabled={!canAct}
          render={<Button size="icon-xs" variant="ghost" />}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Roles</DropdownMenuLabel>
            {roles
              .filter((role) => !role.isDefault)
              .map((role) => {
                const held = member.roleIds.includes(role.id);

                return (
                  <DropdownMenuCheckboxItem
                    checked={held}
                    disabled={!mayManageRoles}
                    key={role.id}
                    onCheckedChange={() => {
                      const input = { userId: member.user.id, roleId: role.id };

                      if (held) {
                        mutations.unassignRole(input);
                      } else {
                        mutations.assignRole(input);
                      }
                    }}
                  >
                    {role.name}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={!mayKick}
            onClick={() => {
              setConfirming("kick");
            }}
          >
            Kick
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!mayBan}
            onClick={() => {
              setConfirming("ban");
            }}
          >
            Ban
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null);
            setReason("");
          }
        }}
        open={confirming !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === "ban" ? `Ban ${name}?` : `Kick ${name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === "ban"
                ? `${name} will be removed and cannot rejoin until unbanned.`
                : `${name} will be removed but can rejoin with a new invite.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirming === "ban" ? (
            <Input
              aria-label="Reason"
              onChange={(event) => {
                setReason(event.target.value);
              }}
              placeholder="Reason (optional)"
              value={reason}
            />
          ) : null}

          {mutations.error === null ? null : (
            <p className="text-sm text-destructive" role="alert">
              {mutations.error}
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="ghost" />}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming === "ban") {
                  mutations.ban({ userId: member.user.id, reason });
                } else {
                  mutations.kick(member.user.id);
                }

                setConfirming(null);
                setReason("");
              }}
              render={<Button variant="destructive" />}
            >
              {confirming === "ban" ? "Ban" : "Kick"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
