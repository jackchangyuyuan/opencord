import { Link } from "react-router";

import { SignInForm } from "@/features/auth/components/sign-in-form";

export function SignIn() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <SignInForm />
      <p className="text-sm text-muted-foreground">
        No account yet?{" "}
        <Link className="underline underline-offset-4" to="/sign-up">
          Create one
        </Link>
      </p>
    </main>
  );
}
