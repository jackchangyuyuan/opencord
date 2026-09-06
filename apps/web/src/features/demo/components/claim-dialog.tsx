import { zodResolver } from "@hookform/resolvers/zod";
import {
  type ClaimAccountInput,
  claimAccountSchema,
} from "@opencord/shared/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

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
import { sessionQueryKey } from "@/features/auth/hooks/use-session";
import { applyFieldErrors } from "@/features/auth/lib/field-errors";
import { currentUserQuery } from "@/features/users/api/queries";
import { api } from "@/lib/api-client";
import { useUi } from "@/stores/ui";

interface ClaimedAccount {
  id: string;
  email: string;
  username: string;
  name: string;
}

export function ClaimDialog() {
  const queryClient = useQueryClient();
  const activeModal = useUi((state) => state.activeModal);
  const closeModal = useUi((state) => state.closeModal);

  const form = useForm<ClaimAccountInput>({
    resolver: zodResolver(claimAccountSchema),
    defaultValues: { email: "", username: "", password: "" },
  });

  const claim = useMutation({
    mutationFn: (input: ClaimAccountInput) =>
      api<ClaimedAccount>("/demo/claim", { method: "POST", body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: sessionQueryKey,
        refetchType: "all",
      });
      await queryClient.invalidateQueries({
        queryKey: currentUserQuery.queryKey,
      });

      form.reset();
      closeModal();
    },
    onError: (error) => {
      applyFieldErrors(form, error, "Could not save your account");
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    claim.mutate(values);
  });

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          claim.reset();
          closeModal();
        }
      }}
      open={activeModal === "claim-account"}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save my account</DialogTitle>
          <DialogDescription>
            Everything you have made stays exactly where it is — the same
            servers, the same messages, the same name.
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={(event) => void onSubmit(event)}>
          <FieldGroup>
            <Field data-invalid={form.formState.errors.username !== undefined}>
              <FieldLabel htmlFor="claim-username">Username</FieldLabel>
              <Input
                aria-invalid={form.formState.errors.username !== undefined}
                autoComplete="username"
                id="claim-username"
                {...form.register("username")}
              />
              <FieldError errors={[form.formState.errors.username]} />
            </Field>

            <Field data-invalid={form.formState.errors.email !== undefined}>
              <FieldLabel htmlFor="claim-email">Email</FieldLabel>
              <Input
                aria-invalid={form.formState.errors.email !== undefined}
                autoComplete="email"
                id="claim-email"
                type="email"
                {...form.register("email")}
              />
              <FieldError errors={[form.formState.errors.email]} />
            </Field>

            <Field data-invalid={form.formState.errors.password !== undefined}>
              <FieldLabel htmlFor="claim-password">Password</FieldLabel>
              <Input
                aria-invalid={form.formState.errors.password !== undefined}
                autoComplete="new-password"
                id="claim-password"
                type="password"
                {...form.register("password")}
              />
              <FieldError errors={[form.formState.errors.password]} />
            </Field>

            <FieldError errors={[form.formState.errors.root]} />

            <DialogFooter>
              <Button disabled={claim.isPending} type="submit">
                {claim.isPending ? "Saving…" : "Save my account"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
