import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

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
        className="flex min-h-svh items-center justify-center text-muted-foreground"
      >
        Signing you in…
      </output>
    );
  }

  if (isError) {
    return (
      <div
        className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center"
        role="alert"
      >
        <p className="text-muted-foreground">
          We could not check your session. You have not been signed out.
        </p>
        <Button onClick={() => void refetch()} variant="outline">
          Try again
        </Button>
      </div>
    );
  }

  if (session === null) {
    return <Navigate replace to={`/${returnToQuery(location.pathname)}`} />;
  }

  return children;
}
