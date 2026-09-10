import { Permissions } from "@opencord/shared/permissions";
import { ChevronDown } from "lucide-react";
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
  member,
  permissions,
  roles,
  serverId,
}: {
  member: ServerMemberEntry;
  permissions: number;
  roles: readonly PublicRole[];
  serverId: string;
}) {
  const mutations = useMemberMutations(serverId);

  const [confirming, setConfirming] = useState<Confirming>(null);
  const [reason, setReason] = useState("");

  const name = displayName(member);

  const mayManageRoles = has(permissions, Permissions.MANAGE_ROLES);
  const mayKick = has(permissions, Permissions.KICK_MEMBERS);
  const mayBan = has(permissions, Permissions.BAN_MEMBERS);

  const assignable = mayManageRoles
    ? roles.filter((role) => !role.isDefault)
    : [];

  if (assignable.length === 0 && !mayKick && !mayBan) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Manage ${name}`}
          render={<Button size="sm" variant="outline" />}
        >
          Manage
          <ChevronDown data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-48">
          {assignable.length > 0 ? (
            <DropdownMenuGroup>
              <DropdownMenuLabel>Roles</DropdownMenuLabel>
              {assignable.map((role) => {
                const held = member.roleIds.includes(role.id);

                return (
                  <DropdownMenuCheckboxItem
                    checked={held}
                    closeOnClick={false}
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
          ) : null}

          {assignable.length > 0 && (mayKick || mayBan) ? (
            <DropdownMenuSeparator />
          ) : null}

          {mayKick ? (
            <DropdownMenuItem
              onClick={() => {
                setConfirming("kick");
              }}
            >
              Kick {name}
            </DropdownMenuItem>
          ) : null}
          {mayBan ? (
            <DropdownMenuItem
              onClick={() => {
                setConfirming("ban");
              }}
              variant="destructive"
            >
              Ban {name}
            </DropdownMenuItem>
          ) : null}
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
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
              variant="destructive"
            >
              {confirming === "ban" ? "Ban" : "Kick"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
