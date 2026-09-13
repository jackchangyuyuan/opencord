import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { CenteredPanel } from "@/components/layout/centered-panel";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/hooks/use-session";
import { returnToQuery } from "@/features/auth/lib/return-to";
import { useSocketConnection } from "@/features/realtime/hooks/use-socket-connection";

export function RequireSession({ children }: { children: ReactNode }) {
  const { session, isPending, isError, refetch } = useSession();
  const location = useLocation();

  useSocketConnection(session !== null);

  if (isPending) {
    return (
      <output
        aria-live="polite"
        className="flex min-h-svh flex-col items-center justify-center gap-4 bg-sidebar text-muted-foreground"
      >
        <span
          aria-hidden
          className="flex size-11 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-e2"
        >
          <BrandMark className="size-6" />
        </span>
        <span className="flex items-center gap-1.5 text-body">
          {[0, 1, 2].map((index) => (
            <span
              className="typing-dot size-1.5 rounded-full bg-muted-foreground"
              key={index}
              style={{ animationDelay: `${String(index * 0.16)}s` }}
            />
          ))}
          <span className="ml-1">Signing you in…</span>
        </span>
      </output>
    );
  }

  if (isError) {
    return (
      <div role="alert">
        <CenteredPanel
          description="We could not check your session. You have not been signed out — this was the request, not your account."
          title="Could not reach the server"
        >
          <Button onClick={() => void refetch()} size="sm" variant="outline">
            Try again
          </Button>
        </CenteredPanel>
      </div>
    );
  }

  if (session === null) {
    return <Navigate replace to={`/${returnToQuery(location.pathname)}`} />;
  }

  return children;
}
