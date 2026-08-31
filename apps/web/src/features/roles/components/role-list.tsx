import { Permissions } from "@opencord/shared/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  has,
  useServerPermissions,
} from "@/features/permissions/hooks/use-permissions";
import {
  type PublicRole,
  roleColor,
  serverRolesQuery,
  serverRolesQueryKey,
} from "@/features/roles/api/queries";
import { RoleEditor } from "@/features/roles/components/role-editor";
import { serverQuery } from "@/features/servers/api/queries";
import { currentUserQuery } from "@/features/users/api/queries";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";

function positionOf(
  roles: readonly PublicRole[],
  ownerId: string | undefined,
  userId: string | undefined,
): number {
  if (userId !== undefined && userId === ownerId) {
    return Number.POSITIVE_INFINITY;
  }

  return roles.reduce((highest, role) => Math.max(highest, role.position), 0);
}

export function RoleList({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const permissions = useServerPermissions(serverId);

  const { data: roles } = useQuery(serverRolesQuery(serverId));
  const { data: server } = useQuery(serverQuery(serverId));
  const { data: me } = useQuery(currentUserQuery);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api<PublicRole>(`/servers/${serverId}/roles`, {
        method: "POST",
        body: { name: "New role", permissions: 0, position: 1 },
      }),
    onSuccess: async (role) => {
      await queryClient.invalidateQueries({
        queryKey: serverRolesQueryKey(serverId),
      });
      setSelectedId(role.id);
    },
  });

  if (roles === undefined) {
    return <p className="text-sm text-muted-foreground">Loading roles…</p>;
  }

  const actorPosition = positionOf(
    server?.roles ?? [],
    server?.ownerId,
    me?.id,
  );
  const selected = roles.find((role) => role.id === selectedId) ?? roles[0];
  const mayManage = has(permissions, Permissions.MANAGE_ROLES);

  return (
    <div className="flex gap-4">
      <div className="flex w-48 shrink-0 flex-col gap-2">
        <ul className="flex flex-col gap-0.5">
          {roles.map((role) => (
            <li key={role.id}>
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted",
                  "focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
                  role.id === selected?.id && "bg-muted font-medium",
                )}
                onClick={() => {
                  setSelectedId(role.id);
                }}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-current"
                  style={{ color: roleColor(role) ?? "currentColor" }}
                />
                {role.name}
              </button>
            </li>
          ))}
        </ul>

        {mayManage ? (
          <Button
            disabled={create.isPending}
            onClick={() => {
              create.mutate();
            }}
            size="sm"
            variant="outline"
          >
            <Plus />
            New role
          </Button>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        {selected === undefined ? null : (
          <RoleEditor
            actorPermissions={permissions}
            actorPosition={actorPosition}
            key={selected.id}
            role={selected}
            serverId={serverId}
          />
        )}
      </div>
    </div>
  );
}
