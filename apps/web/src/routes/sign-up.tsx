import { Link } from "react-router";

import { SignUpForm } from "@/features/auth/components/sign-up-form";

export function SignUp() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <SignUpForm />
      <p className="text-sm text-muted-foreground">
        Already registered?{" "}
        <Link className="underline underline-offset-4" to="/sign-in">
          Sign in
        </Link>
      </p>
    </main>
  );
}
