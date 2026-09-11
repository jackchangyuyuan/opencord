import { Permissions } from "@opencord/shared/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";

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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ROLE_PALETTE,
  serverRolesQuery,
  serverRolesQueryKey,
  type ServerRoleSummary,
} from "@/features/roles/api/queries";
import { PermissionGrid } from "@/features/roles/components/permission-grid";
import { RoleChannelOverrides } from "@/features/roles/components/role-channel-overrides";
import {
  colorName,
  hexOf,
  NO_COLOUR,
  NO_COLOUR_LABEL,
} from "@/features/roles/lib/color-name";
import { PERMISSION_NAMES } from "@/features/roles/lib/permissions";
import { useSettingsState } from "@/features/server-settings/lib/settings-state";
import { serverQueryKey } from "@/features/servers/api/queries";
import { api, ApiError } from "@/lib/api-client";

const SWATCH = "size-3 shrink-0 rounded-full bg-current";

function granted(mask: number): number {
  return PERMISSION_NAMES.filter(
    (name) => (mask & Permissions[name]) === Permissions[name],
  ).length;
}

export interface RoleDraft {
  name: string;
  color: number | null;
  permissions: number;
}

function draftOf(role: ServerRoleSummary): RoleDraft {
  return {
    name: role.name,
    color: role.color,
    permissions: role.permissions,
  };
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

export function RoleEditor({
  actorPermissions,
  actorPosition,
  role,
  serverId,
}: {
  actorPermissions: number;
  actorPosition: number;
  role: ServerRoleSummary;
  serverId: string;
}) {
  const queryClient = useQueryClient();
  const nameId = useId();
  const colorId = useId();

  const [draft, setDraft] = useState<RoleDraft>(() => draftOf(role));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [tab, setTab] = useSettingsState("roles:editor-tab", "display");

  const choices = useMemo(() => {
    const palette: number[] = ROLE_PALETTE.map((entry) => entry.value);

    return role.color === null || palette.includes(role.color)
      ? palette
      : [role.color, ...palette];
  }, [role.color]);

  const outranked =
    actorPosition !== Number.POSITIVE_INFINITY &&
    role.position >= actorPosition;

  const mayManage =
    (actorPermissions & Permissions.MANAGE_ROLES) === Permissions.MANAGE_ROLES;

  const readOnly = outranked || !mayManage;

  const identityFixed = role.isDefault;

  const save = useMutation({
    meta: { inline: true },
    mutationFn: (input: RoleDraft) =>
      api<ServerRoleSummary>(`/servers/${serverId}/roles/${role.id}`, {
        method: "PATCH",
        body: identityFixed
          ? { permissions: input.permissions & actorPermissions }
          : {
              name: input.name,
              color: input.color,
              permissions: input.permissions & actorPermissions,
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

  const { data: roles } = useQuery(serverRolesQuery(serverId));

  const others = (roles ?? []).filter(
    (entry) => entry.id !== role.id && !entry.isDefault,
  );
  const beneath = others.filter(
    (entry) => entry.position < role.position,
  ).length;

  const isAdministrator =
    (draft.permissions & Permissions.ADMINISTRATOR) ===
    Permissions.ADMINISTRATOR;

  const dirty =
    draft.name !== role.name ||
    draft.color !== role.color ||
    draft.permissions !== role.permissions;

  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {draft.color === null ? null : (
            <span
              aria-hidden
              className={SWATCH}
              style={{ color: hexOf(draft.color) }}
            />
          )}
          <h3 className="min-w-0 truncate text-sm font-medium">{role.name}</h3>
          {isAdministrator ? (
            <span className="rounded-full border px-1.5 py-px text-micro font-medium tracking-[0.04em] text-muted-foreground uppercase">
              Administrator
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {[
            plural(role.memberCount, "member"),
            identityFixed
              ? "the server's baseline"
              : roles === undefined
                ? null
                : `outranks ${String(beneath)} of ${plural(others.length, "role")}`,
            isAdministrator
              ? "all permissions"
              : `${String(granted(draft.permissions))} of ${String(PERMISSION_NAMES.length)} permissions`,
          ]
            .filter((part) => part !== null)
            .join(" · ")}
        </p>
      </div>

      <Tabs
        className="flex min-h-0 flex-1 flex-col gap-3"
        onValueChange={(next) => {
          setTab(typeof next === "string" ? next : "display");
        }}
        value={tab}
      >
        <TabsList className="w-fit shrink-0" variant="line">
          <TabsTrigger value="display">Display</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
        </TabsList>

        <TabsContent
          className="flex min-h-0 flex-1 flex-col gap-4"
          value="display"
        >
          {identityFixed ? (
            <p className="text-sm text-muted-foreground">
              Every member has <span className="font-medium">@everyone</span>.
              It cannot be renamed, coloured or deleted — its permissions are
              the floor every other role is added to.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
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
                <Select
                  disabled={readOnly}
                  onValueChange={(next: string | null) => {
                    setDraft({
                      ...draft,
                      color:
                        next === null || next === NO_COLOUR
                          ? null
                          : Number(next),
                    });
                  }}
                  value={draft.color === null ? NO_COLOUR : String(draft.color)}
                >
                  <SelectTrigger className="w-full" id={colorId}>
                    <SelectValue>
                      {(value: string | null) =>
                        value === null || value === NO_COLOUR ? (
                          NO_COLOUR_LABEL
                        ) : (
                          <>
                            <span
                              aria-hidden
                              className={SWATCH}
                              style={{ color: hexOf(Number(value)) }}
                            />
                            {colorName(Number(value))}
                          </>
                        )
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_COLOUR}>{NO_COLOUR_LABEL}</SelectItem>
                    {choices.map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        <span
                          aria-hidden
                          className={SWATCH}
                          style={{ color: hexOf(value) }}
                        />
                        {colorName(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          {/* Deleting sits here rather than beside Save, and at the foot of the
              tab rather than in a bar that follows you between tabs. It is the
              one action on this pane that cannot be undone, and it does not
              belong next to the one people press every time. */}
          {readOnly || identityFixed ? null : (
            <div className="mt-auto flex flex-col items-start gap-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Deleting removes this role from{" "}
                {plural(role.memberCount, "member")} and drops its channel
                overrides.
              </p>
              <Button
                disabled={remove.isPending}
                onClick={() => {
                  setConfirmingDelete(true);
                }}
                size="sm"
                variant="destructive"
              >
                Delete role
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent
          className="flex min-h-0 flex-1 flex-col"
          value="permissions"
        >
          <PermissionGrid
            disabled={readOnly}
            heldByActor={actorPermissions}
            onChange={(permissions) => {
              setDraft({ ...draft, permissions });
            }}
            value={draft.permissions}
          />
        </TabsContent>

        <TabsContent className="flex min-h-0 flex-1 flex-col" value="channels">
          <RoleChannelOverrides
            everyonePermissions={
              roles?.find((entry) => entry.isDefault)?.permissions ?? 0
            }
            readOnly={readOnly}
            role={role}
            serverId={serverId}
          />
        </TabsContent>
      </Tabs>

      {readOnly ? (
        <p className="text-sm text-muted-foreground" role="status">
          {mayManage
            ? "This role is at or above your own, so you can read it but not change it."
            : "You can read how this role is set up, but changing it needs Manage roles."}
        </p>
      ) : null}

      {save.error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {save.error instanceof ApiError
            ? save.error.message
            : "Could not save the role"}
        </p>
      )}

      {/* The save bar belongs to the two tabs that edit a draft. The Channels
          tab writes per channel and says so itself, and a Save sitting under it
          that saved something else entirely is the kind of control people press
          once and then never trust again.

          Absent for a reader rather than disabled: the sentence above already
          says which bit is missing, and a permanently greyed Save under it is
          the same news told twice in the form of a control. */}
      {readOnly || tab === "channels" ? null : (
        <div className="flex shrink-0 items-center gap-2 border-t pt-3">
          <Button
            disabled={save.isPending || !dirty}
            onClick={() => {
              save.mutate(draft);
            }}
            size="sm"
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          {dirty ? (
            <Button
              onClick={() => {
                setDraft(draftOf(role));
              }}
              size="sm"
              variant="ghost"
            >
              Reset
            </Button>
          ) : null}
        </div>
      )}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setConfirmingDelete(false);
          }
        }}
        open={confirmingDelete}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {role.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {plural(role.memberCount, "member")} will lose this role, and any
              channel overrides written for it are removed. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {remove.error === null ? null : (
            <p className="text-sm text-destructive" role="alert">
              {remove.error instanceof ApiError
                ? remove.error.message
                : "Could not delete the role"}
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate();
                setConfirmingDelete(false);
              }}
              variant="destructive"
            >
              Delete role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
