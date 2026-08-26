import { zodResolver } from "@hookform/resolvers/zod";
import {
  type CreateServerInput,
  createServerSchema,
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
  serversQueryKey,
  type ServerSummary,
} from "@/features/servers/api/queries";
import { api, ApiError } from "@/lib/api-client";
import { useUi } from "@/stores/ui";

export function CreateServerDialog() {
  const queryClient = useQueryClient();
  const activeModal = useUi((state) => state.activeModal);
  const openModal = useUi((state) => state.openModal);
  const closeModal = useUi((state) => state.closeModal);

  const form = useForm<CreateServerInput>({
    resolver: zodResolver(createServerSchema),
    defaultValues: { name: "" },
  });

  const create = useMutation({
    mutationFn: (input: CreateServerInput) =>
      api<ServerSummary>("/servers", { method: "POST", body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: serversQueryKey });
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
        : "Could not create the server";

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          openModal("create-server");
        } else {
          create.reset();
          closeModal();
        }
      }}
      open={activeModal === "create-server"}
    >
      <DialogTrigger
        render={<Button size="icon" variant="outline" />}
        aria-label="Create a server"
      >
        <Plus />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a server</DialogTitle>
          <DialogDescription>
            Servers hold channels, roles and members.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(event) => void onSubmit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="create-server-name">Name</FieldLabel>
              <Input
                aria-invalid={form.formState.errors.name !== undefined}
                autoComplete="off"
                id="create-server-name"
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
