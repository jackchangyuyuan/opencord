import { zodResolver } from "@hookform/resolvers/zod";
import {
  type UpdateChannelInput,
  updateChannelSchema,
} from "@opencord/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  channelQuery,
  serverChannelsQueryKey,
} from "@/features/channels/api/queries";
import { api, ApiError } from "@/lib/api-client";
import { useUi } from "@/stores/ui";

export function ChannelSettingsDialog({ channelId }: { channelId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeModal = useUi((state) => state.activeModal);
  const closeModal = useUi((state) => state.closeModal);
  const openModal = useUi((state) => state.openModal);

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const { data: channel } = useQuery(channelQuery(channelId));

  const form = useForm<UpdateChannelInput>({
    resolver: zodResolver(updateChannelSchema),
    values: {
      name: channel?.name ?? "",
      topic: channel?.topic ?? "",
      position: channel?.position ?? 0,
    },
  });

  const refresh = async () => {
    if (channel?.serverId != null) {
      await queryClient.invalidateQueries({
        queryKey: serverChannelsQueryKey(channel.serverId),
      });
    }

    await queryClient.invalidateQueries({
      queryKey: ["channels", channelId],
    });
  };

  const save = useMutation({
    mutationFn: (input: UpdateChannelInput) =>
      api<unknown>(`/channels/${channelId}`, { method: "PATCH", body: input }),
    onSuccess: async () => {
      await refresh();
      closeModal();
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      api<unknown>(`/channels/${channelId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      closeModal();
      await navigate("/app");
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    save.mutate({
      ...values,
      topic: values.topic === "" ? null : values.topic,
    });
  });

  const failure =
    save.error instanceof ApiError
      ? save.error.message
      : save.error === null
        ? null
        : "Could not save the channel";

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          openModal("channel-settings");
        } else {
          save.reset();
          setConfirmingDelete(false);
          closeModal();
        }
      }}
      open={activeModal === "channel-settings"}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Channel settings</DialogTitle>
          <DialogDescription>
            Rename the channel, set its topic, or move it in the list.
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={(event) => void onSubmit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="channel-settings-name">Name</FieldLabel>
              <Input
                aria-invalid={form.formState.errors.name !== undefined}
                autoComplete="off"
                id="channel-settings-name"
                {...form.register("name")}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="channel-settings-topic">Topic</FieldLabel>
              <Input
                autoComplete="off"
                id="channel-settings-topic"
                {...form.register("topic")}
              />
              <FieldError errors={[form.formState.errors.topic]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="channel-settings-position">
                Position
              </FieldLabel>
              <Input
                id="channel-settings-position"
                min={0}
                type="number"
                {...form.register("position", { valueAsNumber: true })}
              />
              <FieldError errors={[form.formState.errors.position]} />
            </Field>

            {failure === null ? null : (
              <p className="text-sm text-destructive" role="alert">
                {failure}
              </p>
            )}

            <DialogFooter>
              {confirmingDelete ? (
                <>
                  <Button
                    onClick={() => {
                      setConfirmingDelete(false);
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={remove.isPending}
                    onClick={() => {
                      remove.mutate();
                    }}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    {remove.isPending ? "Deleting…" : "Delete for good"}
                  </Button>
                </>
              ) : (
                <Button
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
              <Button disabled={save.isPending} size="sm" type="submit">
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
