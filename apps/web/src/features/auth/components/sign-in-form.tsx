import { zodResolver } from "@hookform/resolvers/zod";
import { type SignInInput, signInSchema } from "@opencord/shared/schemas";
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
import { SocialSignIn } from "@/features/auth/components/social-sign-in";
import { sessionQueryKey } from "@/features/auth/hooks/use-session";
import { applyFieldErrors } from "@/features/auth/lib/field-errors";
import { readReturnTo } from "@/features/auth/lib/return-to";
import { authClient } from "@/lib/auth-client";

export function SignInForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await authClient.signIn.email(values);

    if (error) {
      applyFieldErrors(form, error, "Could not sign you in");
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
        <SocialSignIn page="sign-in" />

        <Field data-invalid={form.formState.errors.email !== undefined}>
          <FieldLabel htmlFor="sign-in-email">Email</FieldLabel>
          <Input
            autoComplete="email"
            aria-invalid={form.formState.errors.email !== undefined}
            id="sign-in-email"
            type="email"
            {...form.register("email")}
          />
          <FieldError errors={[form.formState.errors.email]} />
        </Field>

        <Field data-invalid={form.formState.errors.password !== undefined}>
          <FieldLabel htmlFor="sign-in-password">Password</FieldLabel>
          <Input
            autoComplete="current-password"
            aria-invalid={form.formState.errors.password !== undefined}
            id="sign-in-password"
            type="password"
            {...form.register("password")}
          />
          <FieldError errors={[form.formState.errors.password]} />
        </Field>

        <FieldError errors={[form.formState.errors.root]} />

        <Button disabled={form.formState.isSubmitting} size="lg" type="submit">
          Sign in
        </Button>
      </FieldGroup>
    </form>
  );
}
