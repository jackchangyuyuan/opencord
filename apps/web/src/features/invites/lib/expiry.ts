import type { InviteSummary } from "@/features/invites/api/queries";

export type InviteState = "live" | "expired" | "exhausted" | "never";

export interface InviteExpiry {
  state: InviteState;
  label: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(count: number, unit: string): string {
  return `${String(count)} ${unit}${count === 1 ? "" : "s"}`;
}

function remaining(ms: number): string {
  if (ms >= DAY) {
    return plural(Math.floor(ms / DAY), "day");
  }

  if (ms >= HOUR) {
    return plural(Math.floor(ms / HOUR), "hour");
  }

  if (ms >= MINUTE) {
    return plural(Math.floor(ms / MINUTE), "minute");
  }

  return "less than a minute";
}

export function inviteExpiry(
  invite: Pick<InviteSummary, "expiresAt" | "maxUses" | "uses">,
  now: number,
): InviteExpiry {
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
    return { state: "exhausted", label: "Used up" };
  }

  if (invite.expiresAt === null) {
    return { state: "never", label: "Never expires" };
  }

  const left = new Date(invite.expiresAt).getTime() - now;

  if (left <= 0) {
    return { state: "expired", label: "Expired" };
  }

  return { state: "live", label: `Expires in ${remaining(left)}` };
}

export function refreshInterval(
  invites: readonly Pick<InviteSummary, "expiresAt" | "maxUses" | "uses">[],
  now: number,
): number | null {
  let soonest = Number.POSITIVE_INFINITY;

  for (const invite of invites) {
    if (
      inviteExpiry(invite, now).state !== "live" ||
      invite.expiresAt === null
    ) {
      continue;
    }

    soonest = Math.min(soonest, new Date(invite.expiresAt).getTime() - now);
  }

  if (soonest === Number.POSITIVE_INFINITY) {
    return null;
  }

  if (soonest >= DAY) {
    return HOUR;
  }

  return soonest >= HOUR ? MINUTE : Math.max(1000, Math.min(soonest, MINUTE));
}
