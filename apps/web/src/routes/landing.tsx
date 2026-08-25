import { Link, useSearchParams } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { useSession } from "@/features/auth/hooks/use-session";
import { forwardReturnTo } from "@/features/auth/lib/return-to";

export function Landing() {
  const { session } = useSession();
  const [searchParams] = useSearchParams();

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">OpenCord</h1>
      <p className="max-w-prose text-muted-foreground">
        A real-time chat server you can open in two windows and watch keep
        itself in sync.
      </p>
      {session === null ? (
        <>
          <Link
            className={buttonVariants({ size: "lg" })}
            to={forwardReturnTo("/sign-up", searchParams)}
          >
            Create an account
          </Link>
          <p className="text-sm text-muted-foreground">
            Already registered?{" "}
            <Link
              className="underline underline-offset-4"
              to={forwardReturnTo("/sign-in", searchParams)}
            >
              Sign in
            </Link>
          </p>
        </>
      ) : (
        <Link className={buttonVariants({ size: "lg" })} to="/app">
          Open the app
        </Link>
      )}
    </main>
  );
}
