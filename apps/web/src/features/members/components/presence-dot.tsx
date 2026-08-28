import type { PresenceStatus } from "@opencord/shared/types";

import { cn } from "@/lib/cn";

const LABEL: Record<PresenceStatus, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do not disturb",
  offline: "Offline",
};

const TONE: Record<PresenceStatus, string> = {
  online: "bg-emerald-500",
  idle: "bg-amber-500",
  dnd: "bg-red-500",
  offline: "bg-muted-foreground/40",
};

export function PresenceDot({ status }: { status: PresenceStatus }) {
  return (
    <span
      aria-label={LABEL[status]}
      className={cn(
        "size-2 shrink-0 rounded-full ring-2 ring-sidebar",
        TONE[status],
      )}
      role="img"
    />
  );
}
