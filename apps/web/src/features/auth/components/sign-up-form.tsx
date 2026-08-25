import { zodResolver } from "@hookform/resolvers/zod";
import { type SignUpInput, signUpSchema } from "@opencord/shared/schemas";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { sessionQueryKey } from "@/features/auth/hooks/use-session";
import { applyFieldErrors } from "@/features/auth/lib/field-errors";
import { readReturnTo } from "@/features/auth/lib/return-to";
import { authClient } from "@/lib/auth-client";

export function SignUpForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", name: "", username: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await authClient.signUp.email(values);

    if (error) {
      applyFieldErrors(form, error, "Could not create your account");
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: sessionQueryKey,
      refetchType: "all",
    });
    await navigate(readReturnTo(searchParams));
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        <Field data-invalid={form.formState.errors.name !== undefined}>
          <FieldLabel htmlFor="sign-up-name">Display name</FieldLabel>
          <Input
            autoComplete="name"
            aria-invalid={form.formState.errors.name !== undefined}
            id="sign-up-name"
            {...form.register("name")}
          />
          <FieldError errors={[form.formState.errors.name]} />
        </Field>

        <Field data-invalid={form.formState.errors.username !== undefined}>
          <FieldLabel htmlFor="sign-up-username">Username</FieldLabel>
          <Input
            autoComplete="username"
            aria-invalid={form.formState.errors.username !== undefined}
            id="sign-up-username"
            {...form.register("username")}
          />
          <FieldError errors={[form.formState.errors.username]} />
        </Field>

        <Field data-invalid={form.formState.errors.email !== undefined}>
          <FieldLabel htmlFor="sign-up-email">Email</FieldLabel>
          <Input
            autoComplete="email"
            aria-invalid={form.formState.errors.email !== undefined}
            id="sign-up-email"
            type="email"
            {...form.register("email")}
          />
          <FieldError errors={[form.formState.errors.email]} />
        </Field>

        <Field data-invalid={form.formState.errors.password !== undefined}>
          <FieldLabel htmlFor="sign-up-password">Password</FieldLabel>
          <Input
            autoComplete="new-password"
            aria-invalid={form.formState.errors.password !== undefined}
            id="sign-up-password"
            type="password"
            {...form.register("password")}
          />
          <FieldError errors={[form.formState.errors.password]} />
        </Field>

        <FieldError errors={[form.formState.errors.root]} />

        <Button disabled={form.formState.isSubmitting} type="submit">
          Create account
        </Button>
      </FieldGroup>
    </form>
  );
}
