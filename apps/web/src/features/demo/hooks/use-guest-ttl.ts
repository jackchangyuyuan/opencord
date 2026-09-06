import { useEffect, useState } from "react";

import { useSession } from "@/features/auth/hooks/use-session";

export const CLAIM_PROMPT_FRACTION = 0.25;

const TICK_MS = 1000;

export interface GuestTtl {
  isGuest: boolean;
  remainingMs: number;
  fraction: number;
  expiring: boolean;
}

function toTime(value: unknown): number | null {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);

    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);

    return () => {
      clearInterval(timer);
    };
  }, [active]);

  return now;
}

export function useGuestTtl(): GuestTtl {
  const { user } = useSession();
  const isGuest = user?.isAnonymous === true;

  const expiresAt = toTime(user?.guestExpiresAt);
  const startedAt = toTime(user?.createdAt);
  const now = useNow(isGuest && expiresAt !== null);

  if (!isGuest || expiresAt === null || startedAt === null) {
    return { isGuest, remainingMs: 0, fraction: 1, expiring: false };
  }

  const total = Math.max(expiresAt - startedAt, 1);
  const remainingMs = Math.max(expiresAt - now, 0);
  const fraction = Math.min(remainingMs / total, 1);

  return {
    isGuest,
    remainingMs,
    fraction,
    expiring: fraction < CLAIM_PROMPT_FRACTION,
  };
}
