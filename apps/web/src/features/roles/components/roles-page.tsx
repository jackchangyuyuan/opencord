import { Permissions } from "@opencord/shared/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Shield } from "lucide-react";

import { ListError, ListSkeleton } from "@/components/data-list/list-states";
import { matches } from "@/components/data-list/matches";
import { SearchField } from "@/components/data-list/search-field";
import { Button } from "@/components/ui/button";
import {
  has,
  useServerPermissions,
} from "@/features/permissions/hooks/use-permissions";
import {
  type PublicRole,
  serverRolesQuery,
  serverRolesQueryKey,
} from "@/features/roles/api/queries";
import { RoleEditor } from "@/features/roles/components/role-editor";
import { RoleList } from "@/features/roles/components/role-list";
import { SettingsPage } from "@/features/server-settings/components/settings-page";
import { useSettingsState } from "@/features/server-settings/lib/settings-state";
import { serverQuery } from "@/features/servers/api/queries";
import { currentUserQuery } from "@/features/users/api/queries";
import { api } from "@/lib/api-client";

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

export function RolesPage({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const permissions = useServerPermissions(serverId);

  const [term, setTerm] = useSettingsState("roles:search", "");
  const [selectedId, setSelectedId] = useSettingsState<string | null>(
    "roles:selected",
    null,
  );

  const {
    data: roles,
    isPending,
    isError,
  } = useQuery(serverRolesQuery(serverId));
  const { data: server } = useQuery(serverQuery(serverId));
  const { data: me } = useQuery(currentUserQuery);

  const mayManage = has(permissions, Permissions.MANAGE_ROLES);

  const create = useMutation({
    mutationFn: () =>
      api<PublicRole>(`/servers/${serverId}/roles`, {
        method: "POST",
        body: { name: "New role", permissions: 0 },
      }),
    onSuccess: async (role) => {
      await queryClient.invalidateQueries({
        queryKey: serverRolesQueryKey(serverId),
      });
      setTerm("");
      setSelectedId(role.id);
    },
  });

  const actorPosition = positionOf(
    server?.viewerRoles ?? [],
    server?.ownerId,
    me?.id,
  );

  const shown = (roles ?? []).filter((role) => matches(term, role.name));
  const selected =
    shown.find((role) => role.id === selectedId) ?? shown[0] ?? undefined;

  return (
    <SettingsPage
      count={roles?.length}
      description="A role is a set of defaults. Drag to rank them — higher roles win."
      title="Roles"
    >
      {isError ? (
        <ListError>Could not load this server&rsquo;s roles.</ListError>
      ) : isPending ? (
        <ListSkeleton rows={4} />
      ) : (
        <div className="flex min-h-full flex-col gap-4 sm:flex-row sm:gap-5">
          <div className="flex shrink-0 flex-col gap-2 sm:w-52">
            <SearchField
              label="Search roles by name"
              onChange={setTerm}
              placeholder="Search roles"
              value={term}
            />

            {shown.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                No roles match “{term}”.
              </p>
            ) : (
              <RoleList
                actorPosition={actorPosition}
                mayManage={mayManage}
                onSelect={setSelectedId}
                roles={roles}
                selectedId={selected?.id ?? null}
                serverId={serverId}
                shown={shown}
              />
            )}

            {/* Why the handles are gone, said where they are missing from. A
                reorder submits the whole visible order, so a drag inside a
                filtered list would renumber the roles it is hiding. */}
            {term !== "" && mayManage && shown.length > 0 ? (
              <p className="px-1 text-xs text-muted-foreground">
                Clear the search to reorder roles.
              </p>
            ) : null}

            {mayManage ? (
              <Button
                className="mt-1"
                disabled={create.isPending}
                onClick={() => {
                  create.mutate();
                }}
                size="sm"
                variant="outline"
              >
                <Plus data-icon="inline-start" />
                New role
              </Button>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            {selected === undefined ? (
              <div className="flex h-full items-center justify-center">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Shield aria-hidden className="size-4" />
                  Pick a role to see what it grants.
                </p>
              </div>
            ) : (
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
      )}
    </SettingsPage>
  );
}
