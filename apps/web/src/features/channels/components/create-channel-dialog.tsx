import { zodResolver } from "@hookform/resolvers/zod";
import {
  type CreateChannelInput,
  createChannelSchema,
} from "@opencord/shared/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  type ChannelSummary,
  serverChannelsQueryKey,
} from "@/features/channels/api/queries";
import { api, ApiError } from "@/lib/api-client";
import { useUi } from "@/stores/ui";

export function CreateChannelDialog({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const activeModal = useUi((state) => state.activeModal);
  const openModal = useUi((state) => state.openModal);
  const closeModal = useUi((state) => state.closeModal);

  const form = useForm<CreateChannelInput>({
    resolver: zodResolver(createChannelSchema),
    defaultValues: { name: "" },
  });

  const create = useMutation({
    mutationFn: (input: CreateChannelInput) =>
      api<ChannelSummary>(`/servers/${serverId}/channels`, {
        method: "POST",
        body: input,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: serverChannelsQueryKey(serverId),
      });
      form.reset();
      closeModal();
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    create.mutate(values);
  });

  const failure =
    create.error instanceof ApiError
      ? create.error.message
      : create.error === null
        ? null
        : "Could not create the channel";

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          openModal("create-channel");
        } else {
          create.reset();
          closeModal();
        }
      }}
      open={activeModal === "create-channel"}
    >
      <DialogTrigger
        render={<Button size="icon-xs" variant="ghost" />}
        aria-label="Create a channel"
      >
        <Plus />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a channel</DialogTitle>
          <DialogDescription>
            Lowercase letters, digits and hyphens only.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(event) => void onSubmit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="create-channel-name">Name</FieldLabel>
              <Input
                aria-invalid={form.formState.errors.name !== undefined}
                autoComplete="off"
                id="create-channel-name"
                {...form.register("name")}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>

            {failure === null ? null : (
              <p className="text-sm text-destructive" role="alert">
                {failure}
              </p>
            )}

            <DialogFooter>
              <Button disabled={create.isPending} type="submit">
                {create.isPending
                  ? "Creating…"
                  : create.isError
                    ? "Try again"
                    : "Create"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
