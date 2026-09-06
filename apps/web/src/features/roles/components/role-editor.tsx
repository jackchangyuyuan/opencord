import { Permissions } from "@opencord/shared/permissions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  type PublicRole,
  ROLE_PALETTE,
  serverRolesQueryKey,
} from "@/features/roles/api/queries";
import { PermissionGrid } from "@/features/roles/components/permission-grid";
import { serverQueryKey } from "@/features/servers/api/queries";
import { api, ApiError } from "@/lib/api-client";

export interface RoleDraft {
  name: string;
  color: number | null;
  permissions: number;
  position: number;
}

function draftOf(role: PublicRole): RoleDraft {
  return {
    name: role.name,
    color: role.color,
    permissions: role.permissions,
    position: role.position,
  };
}

export function RoleEditor({
  actorPermissions,
  actorPosition,
  role,
  serverId,
}: {
  actorPermissions: number;
  actorPosition: number;
  role: PublicRole;
  serverId: string;
}) {
  const queryClient = useQueryClient();
  const nameId = useId();
  const colorId = useId();
  const positionId = useId();

  const [draft, setDraft] = useState<RoleDraft>(() => draftOf(role));

  const locked =
    role.isDefault ||
    (actorPosition !== Number.POSITIVE_INFINITY &&
      role.position >= actorPosition);

  const mayManage =
    (actorPermissions & Permissions.MANAGE_ROLES) === Permissions.MANAGE_ROLES;

  const save = useMutation({
    meta: { inline: true },
    mutationFn: (input: RoleDraft) =>
      api<PublicRole>(`/servers/${serverId}/roles/${role.id}`, {
        method: "PATCH",
        body: {
          name: input.name,
          color: input.color,
          permissions: input.permissions & actorPermissions,
          ...(role.isDefault ? {} : { position: input.position }),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: serverRolesQueryKey(serverId),
      });
      await queryClient.invalidateQueries({
        queryKey: serverQueryKey(serverId),
      });
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      api<unknown>(`/servers/${serverId}/roles/${role.id}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: serverRolesQueryKey(serverId),
      });
    },
  });

  const readOnly = locked || !mayManage;

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor={nameId}>Name</FieldLabel>
        <Input
          autoComplete="off"
          disabled={readOnly}
          id={nameId}
          onChange={(event) => {
            setDraft({ ...draft, name: event.target.value });
          }}
          value={draft.name}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={colorId}>Colour</FieldLabel>
        <select
          className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
          disabled={readOnly}
          id={colorId}
          onChange={(event) => {
            setDraft({
              ...draft,
              color:
                event.target.value === "" ? null : Number(event.target.value),
            });
          }}
          value={draft.color === null ? "" : String(draft.color)}
        >
          <option value="">No colour</option>
          {ROLE_PALETTE.map((entry) => (
            <option key={entry.name} value={String(entry.value)}>
              {entry.name}
            </option>
          ))}
        </select>
      </Field>

      {role.isDefault ? null : (
        <Field>
          <FieldLabel htmlFor={positionId}>Position</FieldLabel>
          <Input
            disabled={readOnly}
            id={positionId}
            min={1}
            onChange={(event) => {
              setDraft({ ...draft, position: Number(event.target.value) });
            }}
            type="number"
            value={draft.position}
          />
        </Field>
      )}

      <PermissionGrid
        disabled={readOnly}
        heldByActor={actorPermissions}
        onChange={(permissions) => {
          setDraft({ ...draft, permissions });
        }}
        value={draft.permissions}
      />

      {save.error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {save.error instanceof ApiError
            ? save.error.message
            : "Could not save the role"}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          disabled={readOnly || save.isPending}
          onClick={() => {
            save.mutate(draft);
          }}
          size="sm"
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        {role.isDefault ? null : (
          <Button
            disabled={readOnly || remove.isPending}
            onClick={() => {
              remove.mutate();
            }}
            size="sm"
            variant="destructive"
          >
            Delete role
          </Button>
        )}
      </div>
    </div>
  );
}
