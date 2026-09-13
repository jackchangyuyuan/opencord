import { zodResolver } from "@hookform/resolvers/zod";
import { CHANNEL_TOPIC_MAX_LENGTH } from "@opencord/shared/constants";
import { Permissions } from "@opencord/shared/permissions";
import {
  type UpdateChannelInput,
  updateChannelSchema,
} from "@opencord/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Fact, FactList } from "@/components/ui/fact";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  channelOverwritesQuery,
  channelQuery,
  serverChannelsQueryKey,
} from "@/features/channels/api/queries";
import { ChannelPermissions } from "@/features/channels/components/channel-permissions";
import {
  has,
  useChannelPermissions,
} from "@/features/permissions/hooks/use-permissions";
import { serverRolesQuery } from "@/features/roles/api/queries";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useUi } from "@/stores/ui";

const CHANNEL_TYPE: Record<string, string> = {
  dm: "Direct message",
  group_dm: "Group message",
  text: "Text channel",
  voice: "Voice channel",
};

const CREATED = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function ChannelSettingsDialog({ channelId }: { channelId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const activeModal = useUi((state) => state.activeModal);
  const closeModal = useUi((state) => state.closeModal);
  const closeChannelSettings = useUi((state) => state.closeChannelSettings);
  const openModal = useUi((state) => state.openModal);

  const open = activeModal === "channel-settings";
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const trigger = document.activeElement;

    returnFocusRef.current =
      trigger instanceof HTMLButtonElement
        ? trigger
        : document.querySelector<HTMLElement>(
            `nav a[href="/app/channels/${channelId}"]`,
          );
  }, [channelId, open]);

  const { data: channel } = useQuery(channelQuery(channelId));

  const serverId = channel?.serverId ?? null;

  const readOnly = !has(
    useChannelPermissions(channelId),
    Permissions.MANAGE_CHANNELS,
  );

  const form = useForm<UpdateChannelInput>({
    resolver: zodResolver(updateChannelSchema),
    values: {
      name: channel?.name ?? "",
      topic: channel?.topic ?? "",
    },
  });

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    meta: { inline: true },
    mutationFn: (input: UpdateChannelInput) =>
      api<unknown>(`/channels/${channelId}`, { method: "PATCH", body: input }),
    onSuccess: async () => {
      setSaved(true);

      if (channel?.serverId != null) {
        await queryClient.invalidateQueries({
          queryKey: serverChannelsQueryKey(channel.serverId),
        });
      }

      await queryClient.invalidateQueries({
        queryKey: ["channels", channelId],
      });
    },
  });

  useEffect(() => {
    if (!saved) {
      return;
    }

    const timer = setTimeout(() => {
      setSaved(false);
    }, 2500);

    return () => {
      clearTimeout(timer);
    };
  }, [saved]);

  const remove = useMutation({
    meta: { inline: true },
    mutationFn: () =>
      api<unknown>(`/channels/${channelId}`, { method: "DELETE" }),
    onSuccess: async () => {
      setConfirmingDelete(false);
      closeChannelSettings();

      if (serverId !== null) {
        queryClient.removeQueries({ queryKey: ["channels", channelId] });

        await queryClient.invalidateQueries({
          queryKey: serverChannelsQueryKey(serverId),
        });
        void navigate(`/app/servers/${serverId}`);
      }
    },
  });

  const submit = form.handleSubmit((values) => {
    setSaved(false);
    save.mutate({
      name: values.name,
      topic: values.topic === "" || values.topic == null ? null : values.topic,
    });
  });

  const failure =
    save.error instanceof ApiError
      ? save.error.message
      : save.error === null
        ? null
        : "Could not save the channel";

  const dirty = form.formState.isDirty;

  const status = readOnly
    ? "You can read how this channel is set up, but changing it needs Manage channels."
    : (failure ??
      (save.isPending
        ? "Saving…"
        : saved
          ? "Saved"
          : dirty
            ? "Unsaved changes"
            : null));

  const { data: overwrites } = useQuery({
    ...channelOverwritesQuery(channelId),
    enabled: serverId !== null,
  });

  const { data: roles } = useQuery({
    ...serverRolesQuery(serverId ?? ""),
    enabled: serverId !== null,
  });

  const overrideCount = (overwrites?.roles ?? []).filter(
    (entry) => entry.allow !== 0 || entry.deny !== 0,
  ).length;

  const everyoneId = roles?.find((role) => role.isDefault)?.id;
  const everyoneOverwrite = overwrites?.roles.find(
    (entry) => entry.roleId === everyoneId,
  );
  const hidden =
    everyoneOverwrite !== undefined &&
    (everyoneOverwrite.deny & Permissions.VIEW_CHANNEL) ===
      Permissions.VIEW_CHANNEL;

  const deleteFailure =
    remove.error instanceof ApiError
      ? remove.error.message
      : remove.error === null
        ? null
        : "Could not delete the channel";

  return (
    <>
      <Dialog
        onOpenChange={(open) => {
          if (open) {
            openModal("channel-settings");
          } else {
            save.reset();
            remove.reset();
            setSaved(false);
            setConfirmingDelete(false);
            closeModal();
          }
        }}
        open={open}
      >
        <DialogContent
          className={cn(
            "sm:max-w-2xl",
            serverId === null
              ? undefined
              : "h-[min(37.5rem,calc(100svh-2rem))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden",
          )}
          finalFocus={returnFocusRef}
        >
          <DialogHeader>
            <DialogTitle>
              {channel?.name == null ? "Channel settings" : `#${channel.name}`}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {serverId === null
                ? "Channel settings."
                : "Channel settings and permissions."}
            </DialogDescription>
          </DialogHeader>

          <Tabs
            className="flex min-h-0 min-w-0 flex-col"
            defaultValue="overview"
          >
            {serverId === null ? null : (
              <TabsList className="shrink-0">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="permissions">Permissions</TabsTrigger>
              </TabsList>
            )}

            <TabsContent
              className="flex min-h-0 flex-1 flex-col overflow-y-auto"
              value="overview"
            >
              <form
                className="flex min-h-full flex-col gap-4"
                noValidate
                onSubmit={(event) => void submit(event)}
              >
                <FieldGroup>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="channel-settings-name">
                        Name
                      </FieldLabel>
                      <Input
                        aria-invalid={form.formState.errors.name !== undefined}
                        autoComplete="off"
                        disabled={readOnly}
                        id="channel-settings-name"
                        {...form.register("name")}
                      />
                      <FieldError errors={[form.formState.errors.name]} />
                    </Field>

                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-medium">Type</p>
                      <p className="flex h-9 items-center text-sm text-muted-foreground">
                        {CHANNEL_TYPE[channel?.type ?? "text"]}
                      </p>
                    </div>
                  </div>

                  <Field>
                    <FieldLabel htmlFor="channel-settings-topic">
                      Topic
                    </FieldLabel>
                    <Textarea
                      autoComplete="off"
                      className={
                        serverId === null
                          ? undefined
                          : "field-sizing-fixed h-32 resize-none"
                      }
                      disabled={readOnly}
                      id="channel-settings-topic"
                      maxLength={CHANNEL_TOPIC_MAX_LENGTH}
                      placeholder="What this channel is for"
                      rows={4}
                      {...form.register("topic")}
                    />
                    <FieldError errors={[form.formState.errors.topic]} />
                  </Field>
                </FieldGroup>

                {serverId === null || channel === undefined ? null : (
                  <FactList className="border-t pt-4 sm:grid-cols-3">
                    <Fact label="Created">
                      <time
                        dateTime={channel.createdAt}
                        title={new Date(channel.createdAt).toLocaleString()}
                      >
                        {CREATED.format(new Date(channel.createdAt))}
                      </time>
                    </Fact>
                    <Fact label="Visibility">
                      {overwrites === undefined
                        ? "—"
                        : hidden
                          ? "Private — @everyone cannot view"
                          : "Everyone in this server"}
                    </Fact>
                    <Fact label="Permission overrides">
                      {overwrites === undefined
                        ? "—"
                        : overrideCount === 0
                          ? "None — every role inherits"
                          : overrideCount === 1
                            ? "1 role"
                            : `${String(overrideCount)} roles`}
                    </Fact>
                  </FactList>
                )}

                {deleteFailure === null ? null : (
                  <p className="text-sm text-destructive" role="alert">
                    {deleteFailure}
                  </p>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-3 border-t pt-3">
                  {readOnly ? null : (
                    <Button
                      disabled={save.isPending || !dirty}
                      size="sm"
                      type="submit"
                    >
                      {save.isPending ? "Saving…" : "Save changes"}
                    </Button>
                  )}
                  {readOnly || !dirty ? null : (
                    <Button
                      onClick={() => {
                        form.reset();
                        save.reset();
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Reset
                    </Button>
                  )}

                  <p
                    aria-live="polite"
                    className={cn(
                      "min-h-5 min-w-0 flex-1 text-xs",
                      failure === null
                        ? "text-muted-foreground"
                        : "text-destructive",
                    )}
                    role="status"
                  >
                    {status}
                  </p>

                  {readOnly || serverId === null ? null : (
                    <Button
                      disabled={remove.isPending}
                      onClick={() => {
                        setConfirmingDelete(true);
                      }}
                      size="sm"
                      type="button"
                      variant="destructive"
                    >
                      Delete channel
                    </Button>
                  )}
                </div>
              </form>
            </TabsContent>

            {serverId === null || channel === undefined ? null : (
              <TabsContent
                className="flex min-h-0 flex-1 flex-col overflow-y-auto"
                value="permissions"
              >
                <ChannelPermissions
                  channelId={channelId}
                  channelName={channel.name ?? "channel"}
                  serverId={serverId}
                />
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

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
            <AlertDialogTitle>
              Delete{" "}
              {channel?.name == null ? "this channel" : `#${channel.name}`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every message in it goes with it, along with its pins and its
              permission overrides. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate();
              }}
              variant="destructive"
            >
              {remove.isPending ? "Deleting…" : "Delete channel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
