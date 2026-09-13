import { badgeCount, type UnreadState } from "@/features/channels/lib/unread";
import { cn } from "@/lib/cn";

export function UnreadBadge({
  className,
  count,
  countOnly = false,
  label,
  noun = "mention",
  state,
}: {
  className?: string;
  count?: number;
  countOnly?: boolean;
  label: string;
  noun?: string;
  state: UnreadState;
}) {
  const total = count ?? badgeCount(state);

  if (total > 0) {
    return (
      <span
        className={cn(
          "ml-auto flex min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive-solid px-1.5 py-0.5 text-micro leading-tight font-semibold text-white tabular-nums",
          className,
        )}
      >
        <span aria-hidden="true">{total > 99 ? "99+" : total}</span>
        <span className="sr-only">
          {`${label}: ${String(total)} unread ${total === 1 ? noun : `${noun}s`}`}
        </span>
      </span>
    );
  }

  if (!state.hasUnread) {
    return null;
  }

  if (countOnly) {
    return <span className="sr-only">{`${label}: unread messages`}</span>;
  }

  return (
    <span className={cn("ml-auto flex shrink-0 items-center", className)}>
      <span aria-hidden="true" className="size-2 rounded-full bg-foreground" />
      <span className="sr-only">{`${label}: unread messages`}</span>
    </span>
  );
}
