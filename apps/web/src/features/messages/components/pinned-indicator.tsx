import { Pin } from "lucide-react";

export function PinnedIndicator({ pinnedAt }: { pinnedAt: string | null }) {
  if (pinnedAt === null) {
    return null;
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      data-slot="pinned-indicator"
    >
      <Pin aria-hidden className="size-3" />
      <span className="sr-only">Pinned</span>
    </span>
  );
}
