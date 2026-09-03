import { zodResolver } from "@hookform/resolvers/zod";
import {
  type UpdateProfileInput,
  updateProfileSchema,
} from "@opencord/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
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
  type CurrentUser,
  currentUserQuery,
} from "@/features/users/api/queries";
import { AvatarPicker } from "@/features/users/components/avatar-picker";
import { api, ApiError } from "@/lib/api-client";

export function ProfileDialog() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery(currentUserQuery);

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    values: { name: me?.name ?? "" },
  });

  const save = useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      api<CurrentUser>("/users/@me", { method: "PATCH", body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: currentUserQuery.queryKey,
      });
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    save.mutate(values);
  });

  const failure =
    save.error instanceof ApiError
      ? save.error.message
      : save.error === null
        ? null
        : "Could not save your profile";

  return (
    <Dialog>
      <DialogTrigger
        aria-label="Your profile"
        render={<Button size="icon-xs" variant="ghost" />}
      >
        <UserRound />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your profile</DialogTitle>
          <DialogDescription>
            Your display name and picture, as everybody else sees them.
          </DialogDescription>
        </DialogHeader>

        <AvatarPicker
          currentUrl={me?.avatarUrl ?? null}
          fallback={(me?.name ?? "?").slice(0, 2).toUpperCase()}
          kind="avatar"
          label="Choose a picture"
          onPicked={(avatarObjectKey) => {
            save.mutate({ avatarObjectKey });
          }}
        />

        <form noValidate onSubmit={(event) => void onSubmit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="profile-name">Display name</FieldLabel>
              <Input
                aria-invalid={form.formState.errors.name !== undefined}
                autoComplete="off"
                id="profile-name"
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
