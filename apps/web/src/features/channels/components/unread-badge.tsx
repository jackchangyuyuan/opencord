import { badgeCount, type UnreadState } from "@/features/channels/lib/unread";
import { cn } from "@/lib/cn";

export function UnreadBadge({
  className,
  label,
  state,
}: {
  className?: string;
  label: string;
  state: UnreadState;
}) {
  const count = badgeCount(state);

  if (count > 0) {
    return (
      <span
        className={cn(
          "ml-auto flex min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[0.625rem] leading-none font-semibold text-white",
          className,
        )}
      >
        <span aria-hidden="true">{count}</span>
        <span className="sr-only">
          {`${label}: ${String(count)} unread ${count === 1 ? "mention" : "mentions"}`}
        </span>
      </span>
    );
  }

  if (!state.hasUnread) {
    return null;
  }

  return (
    <span className={cn("ml-auto flex shrink-0 items-center", className)}>
      <span aria-hidden="true" className="size-2 rounded-full bg-foreground" />
      <span className="sr-only">{`${label}: unread messages`}</span>
    </span>
  );
}
