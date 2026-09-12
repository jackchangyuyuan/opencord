import { zodResolver } from "@hookform/resolvers/zod";
import { DESCRIPTION_MAX_LENGTH } from "@opencord/shared/constants";
import { Permissions } from "@opencord/shared/permissions";
import { serverNameSchema } from "@opencord/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { z } from "zod";

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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Fact, FactList } from "@/components/ui/fact";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Truncated } from "@/components/ui/truncated";
import { serverChannelsQuery } from "@/features/channels/api/queries";
import {
  has,
  useServerPermissions,
} from "@/features/permissions/hooks/use-permissions";
import { serverRolesQuery } from "@/features/roles/api/queries";
import {
  SettingsPage,
  SettingsSection,
} from "@/features/server-settings/components/settings-page";
import {
  serverQueryKey,
  serversQueryKey,
  type ServerSummary,
} from "@/features/servers/api/queries";
import { TransferOwnerForm } from "@/features/servers/components/transfer-owner-form";
import { currentUserQuery, userQuery } from "@/features/users/api/queries";
import { AvatarPicker } from "@/features/users/components/avatar-picker";
import { api, ApiError } from "@/lib/api-client";

const OWNER_MUST_TRANSFER = "OWNER_MUST_TRANSFER";

const CREATED = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const identitySchema = z.object({
  name: serverNameSchema,
  description: z.string().trim().max(DESCRIPTION_MAX_LENGTH),
});

type IdentityDraft = z.infer<typeof identitySchema>;

export function OverviewPage({
  onDone,
  server,
}: {
  onDone: () => void;
  server: ServerSummary;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const permissions = useServerPermissions(server.id);

  const { data: me } = useQuery(currentUserQuery);
  const { data: roles } = useQuery(serverRolesQuery(server.id));
  const { data: channels } = useQuery(serverChannelsQuery(server.id));
  const { data: owner } = useQuery(userQuery(server.ownerId));

  const [confirming, setConfirming] = useState<"leave" | "delete" | null>(null);

  const mayManage = has(permissions, Permissions.MANAGE_SERVER);
  const isOwner = me?.id === server.ownerId;
  const initials = server.name.slice(0, 2).toUpperCase();

  const form = useForm<IdentityDraft>({
    resolver: zodResolver(identitySchema),
    values: { name: server.name, description: server.description ?? "" },
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: serversQueryKey });
    await queryClient.invalidateQueries({
      queryKey: serverQueryKey(server.id),
    });
  };

  const save = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api<unknown>(`/servers/${server.id}`, { method: "PATCH", body: input }),
    onSuccess: refresh,
  });

  const leave = useMutation({
    meta: { inline: true },
    mutationFn: () =>
      api<unknown>(`/servers/${server.id}/members/@me`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      onDone();
      await navigate("/app");
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      api<unknown>(`/servers/${server.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      onDone();
      await navigate("/app");
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    save.mutate({
      name: values.name,
      description: values.description === "" ? null : values.description,
    });
  });

  const mustTransfer =
    leave.error instanceof ApiError && leave.error.code === OWNER_MUST_TRANSFER;

  const count = (value: number | undefined) =>
    value === undefined ? "—" : String(value);

  const memberCount = roles?.find((role) => role.isDefault)?.memberCount;

  return (
    <SettingsPage
      description="What this server is, and who it belongs to."
      title="Overview"
    >
      <div className="flex flex-col gap-4">
        <SettingsSection
          description={
            mayManage
              ? "How this server introduces itself in the rail and on an invite."
              : "Changing these needs Manage server."
          }
          title="Identity"
        >
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(event) => void onSubmit(event)}
          >
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
              <div className="flex flex-col gap-2">
                <p className="text-sm leading-snug font-medium">Server icon</p>
                {mayManage ? (
                  <AvatarPicker
                    currentUrl={server.iconUrl}
                    fallback={initials}
                    kind="icon"
                    label="Change icon"
                    onPicked={(iconObjectKey) => {
                      save.mutate({ iconObjectKey });
                    }}
                  />
                ) : (
                  <Avatar aria-hidden className="size-14">
                    <AvatarImage alt="" src={server.iconUrl ?? undefined} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                )}
              </div>

              <Field className="min-w-0">
                <FieldLabel htmlFor="server-settings-name">
                  Server name
                </FieldLabel>
                <Input
                  aria-invalid={form.formState.errors.name !== undefined}
                  autoComplete="off"
                  disabled={!mayManage}
                  id="server-settings-name"
                  {...form.register("name")}
                />
                <FieldError errors={[form.formState.errors.name]} />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="server-settings-description">
                Description
              </FieldLabel>
              <Textarea
                aria-invalid={form.formState.errors.description !== undefined}
                disabled={!mayManage}
                id="server-settings-description"
                maxLength={DESCRIPTION_MAX_LENGTH}
                placeholder="What is this server for?"
                rows={3}
                {...form.register("description")}
              />
              <FieldError errors={[form.formState.errors.description]} />
            </Field>

            {save.error === null ? null : (
              <p className="text-sm text-destructive" role="alert">
                {save.error instanceof ApiError
                  ? save.error.message
                  : "Could not save the server"}
              </p>
            )}

            {/* Absent for a reader rather than permanently greyed: the line
                under the section heading already says the bit is missing, and a
                Save that can never be pressed is the same news told twice in
                the form of a control. */}
            {mayManage ? (
              <div className="flex items-center gap-2">
                <Button
                  disabled={save.isPending || !form.formState.isDirty}
                  size="sm"
                  type="submit"
                >
                  {save.isPending ? "Saving…" : "Save changes"}
                </Button>
                {form.formState.isDirty ? (
                  <Button
                    onClick={() => {
                      form.reset();
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Reset
                  </Button>
                ) : null}
              </div>
            ) : null}
          </form>
        </SettingsSection>

        <SettingsSection
          actions={
            isOwner ? (
              <TransferOwnerForm
                currentOwnerId={server.ownerId}
                serverId={server.id}
              />
            ) : undefined
          }
          className="border-t pt-4"
          title="Ownership"
        >
          <FactList className="sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,0.5fr))_minmax(0,1.1fr)]">
            <Fact label="Owner">
              <span className="flex min-w-0 items-center gap-1.5">
                <Crown
                  aria-hidden
                  className="size-3.5 shrink-0 text-amber-500 dark:text-amber-400"
                />
                <span className="flex min-w-0 flex-col leading-snug">
                  <Truncated
                    value={`${owner?.name ?? "—"}${isOwner ? " (you)" : ""}`}
                  />
                  {owner === undefined ? null : (
                    <Truncated
                      className="text-xs text-muted-foreground"
                      value={`@${owner.username}`}
                    />
                  )}
                </span>
              </span>
            </Fact>
            <Fact label="Members">{count(memberCount)}</Fact>
            <Fact label="Channels">{count(channels?.length)}</Fact>
            <Fact label="Roles">{count(roles?.length)}</Fact>
            <Fact label="Created">
              <time
                dateTime={server.createdAt}
                title={new Date(server.createdAt).toLocaleString()}
              >
                <Truncated value={CREATED.format(new Date(server.createdAt))} />
              </time>
            </Fact>
          </FactList>
        </SettingsSection>

        <SettingsSection
          className="border-t pt-4"
          description={
            isOwner
              ? "Deleting is permanent. Every channel, message and invite goes with the server."
              : "Leaving removes your roles here. You can rejoin with a new invite."
          }
          title="Danger zone"
        >
          <div className="flex flex-wrap items-center gap-2">
            {isOwner ? null : (
              <Button
                disabled={leave.isPending}
                onClick={() => {
                  setConfirming("leave");
                }}
                size="sm"
                variant="outline"
              >
                Leave server
              </Button>
            )}

            {isOwner ? (
              <Button
                onClick={() => {
                  setConfirming("delete");
                }}
                size="sm"
                variant="destructive"
              >
                Delete server
              </Button>
            ) : null}
          </div>

          {mustTransfer ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm" role="alert">
                You own this server. Hand it to another member before you leave.
              </p>
              <TransferOwnerForm
                autoOpen
                currentOwnerId={server.ownerId}
                serverId={server.id}
              />
            </div>
          ) : leave.error === null ? null : (
            <p className="text-sm text-destructive" role="alert">
              {leave.error instanceof ApiError
                ? leave.error.message
                : "Could not leave the server"}
            </p>
          )}
        </SettingsSection>
      </div>

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
              {confirming === "delete"
                ? `Delete ${server.name}?`
                : `Leave ${server.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === "delete"
                ? "Every channel, message and invite in this server is deleted. This cannot be undone."
                : "You lose your roles here. You can rejoin with a new invite."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {remove.error === null ? null : (
            <p className="text-sm text-destructive" role="alert">
              {remove.error instanceof ApiError
                ? remove.error.message
                : "Could not delete the server"}
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending || leave.isPending}
              onClick={() => {
                if (confirming === "delete") {
                  remove.mutate();
                } else {
                  leave.mutate();
                }

                setConfirming(null);
              }}
              variant="destructive"
            >
              {confirming === "delete" ? "Delete server" : "Leave server"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsPage>
  );
}
