import { Link, useSearchParams } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { useSession } from "@/features/auth/hooks/use-session";
import { forwardReturnTo } from "@/features/auth/lib/return-to";
import { useEnterDemo } from "@/features/demo/api/guest";
import { ArchitectureBullets } from "@/features/landing/components/architecture-bullets";
import { DemoLoop } from "@/features/landing/components/demo-loop";

export function LandingPage() {
  const { session } = useSession();
  const [searchParams] = useSearchParams();
  const { enterDemo, isPending, error } = useEnterDemo();

  return (
    <main className="flex min-h-svh flex-col items-center gap-10 p-6 text-center">
      <section className="flex min-h-[70svh] flex-col items-center justify-center gap-5">
        <h1 className="text-4xl font-semibold">OpenCord</h1>
        <p className="max-w-prose text-muted-foreground">
          A real-time chat server you can open in two windows and watch keep
          itself in sync.
        </p>

        {session === null ? (
          <Button
            disabled={isPending}
            onClick={enterDemo}
            size="lg"
            type="button"
          >
            {isPending ? "Setting things up…" : "Enter demo — no signup"}
          </Button>
        ) : (
          <Link className={buttonVariants({ size: "lg" })} to="/app">
            Open the app
          </Link>
        )}

        {error === null ? null : (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <DemoLoop />

        {session === null ? (
          <p className="text-sm text-muted-foreground">
            Or{" "}
            <Link
              className="underline underline-offset-4"
              to={forwardReturnTo("/sign-in", searchParams)}
            >
              sign in
            </Link>{" "}
            &middot;{" "}
            <Link
              className="underline underline-offset-4"
              to={forwardReturnTo("/sign-up", searchParams)}
            >
              create an account
            </Link>
          </p>
        ) : null}
      </section>

      <ArchitectureBullets />
    </main>
  );
}
