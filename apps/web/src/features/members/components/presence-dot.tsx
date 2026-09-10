import type { PresenceStatus } from "@opencord/shared/types";

import { cn } from "@/lib/cn";
import { PRESENCE_LABEL } from "@/stores/presence";

const TONE: Record<PresenceStatus, string> = {
  online: "bg-presence-online",
  idle: "bg-presence-idle",
  dnd: "bg-presence-dnd",
  offline: "bg-presence-offline",
};

export function PresenceDot({
  className,
  status,
}: {
  className?: string;
  status: PresenceStatus;
}) {
  return (
    <span
      aria-label={PRESENCE_LABEL[status]}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        TONE[status],
        className,
      )}
      role="img"
    />
  );
}
