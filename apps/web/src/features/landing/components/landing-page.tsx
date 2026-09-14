import { ArrowRight, CodeXml } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { BrandMark } from "@/components/ui/brand-mark";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSession } from "@/features/auth/hooks/use-session";
import { forwardReturnTo } from "@/features/auth/lib/return-to";
import { useEnterDemo } from "@/features/demo/api/guest";
import { DemoLoop } from "@/features/landing/components/demo-loop";
import { FeatureCards } from "@/features/landing/components/feature-cards";

const REPOSITORY = "https://github.com/jackchangyuyuan/opencord";

export function LandingPage() {
  const { session } = useSession();
  const [searchParams] = useSearchParams();
  const { enterDemo, isPending, error } = useEnterDemo();

  return (
    <div className="flex min-h-svh flex-col bg-sidebar">
      <header className="flex shrink-0 items-center gap-2 px-6 py-5">
        <span
          aria-hidden
          className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground"
        >
          <BrandMark className="size-[1.15rem]" />
        </span>
        <span className="text-sm font-semibold tracking-tight">OpenCord</span>
        <a
          className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          href={REPOSITORY}
          rel="noreferrer"
          target="_blank"
        >
          <CodeXml aria-hidden className="size-3.5" />
          Source
        </a>
      </header>

      <main className="flex flex-1 flex-col items-center gap-16 px-6 pb-20">
        <section className="flex w-full max-w-4xl flex-col items-center gap-6 pt-8 text-center sm:pt-10">
          <p className="flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-presence-online"
            />
            Live demo · no signup · guest session
          </p>

          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              OpenCord
            </h1>
            <p className="mx-auto max-w-2xl text-[0.9375rem] leading-relaxed text-balance text-muted-foreground">
              A full-stack realtime chat platform built to exercise the problems
              that only appear beyond a toy demo: multiple API instances,
              permission-aware data access, large message histories, search,
              uploads and realtime synchronization.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {session === null ? (
              <Button
                className="group h-10 px-5"
                disabled={isPending}
                onClick={enterDemo}
                size="lg"
                type="button"
              >
                {isPending ? "Setting things up…" : "Enter demo — no signup"}
                <ArrowRight className="transition-transform duration-150 group-hover:translate-x-0.5" />
              </Button>
            ) : (
              <Link
                className={buttonVariants({
                  size: "lg",
                  className: "h-10 px-5",
                })}
                to="/app"
              >
                Open the app
                <ArrowRight />
              </Link>
            )}
          </div>

          {error === null ? null : (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}

          <DemoLoop />

          {session === null ? (
            <p className="text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link
                className="text-foreground underline underline-offset-4 hover:text-brand"
                to={forwardReturnTo("/sign-in", searchParams)}
              >
                Sign in
              </Link>{" "}
              &middot;{" "}
              <Link
                className="text-foreground underline underline-offset-4 hover:text-brand"
                to={forwardReturnTo("/sign-up", searchParams)}
              >
                Create an account
              </Link>
            </p>
          ) : null}
        </section>

        <div className="w-full max-w-5xl">
          <FeatureCards />
        </div>
      </main>

      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t bg-background px-6 py-5 text-xs text-muted-foreground">
        <span>OpenCord</span>
        <span aria-hidden>·</span>
        <span>MIT licensed</span>
        <span aria-hidden>·</span>
        <a
          className="underline underline-offset-4 hover:text-foreground"
          href={REPOSITORY}
          rel="noreferrer"
          target="_blank"
        >
          Read the source
        </a>
      </footer>
    </div>
  );
}
