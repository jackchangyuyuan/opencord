import { Link } from "react-router";

import { buttonVariants } from "@/components/ui/button";

export function Landing() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">OpenCord</h1>
      <p className="max-w-prose text-muted-foreground">
        A real-time chat server you can open in two windows and watch keep
        itself in sync.
      </p>
      <Link className={buttonVariants({ size: "lg" })} to="/app">
        Enter demo — no signup
      </Link>
    </main>
  );
}
