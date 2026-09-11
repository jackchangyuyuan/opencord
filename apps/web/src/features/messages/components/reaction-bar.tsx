import type { MessageReaction } from "@opencord/shared/types";

import { cn } from "@/lib/cn";
import { releaseAfterPointer } from "@/lib/pointer-focus";

export function ReactionBar({
  disabled = false,
  onToggle,
  reactions,
}: {
  disabled?: boolean;
  onToggle: (emoji: string, add: boolean) => void;
  reactions: readonly MessageReaction[];
}) {
  if (reactions.length === 0) {
    return null;
  }

  return (
    <ul className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {reactions.map((reaction) => (
        <li key={reaction.emoji}>
          <button
            aria-label={`${reaction.emoji} ${String(reaction.count)}`}
            aria-pressed={reaction.me}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-meta transition-colors duration-100",
              "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              "disabled:pointer-events-none disabled:opacity-60",
              reaction.me
                ? "border-brand/50 bg-brand-subtle text-foreground"
                : "border-border bg-muted text-muted-foreground hover:border-foreground/20 hover:text-foreground",
            )}
            disabled={disabled}
            onClick={(event) => {
              onToggle(reaction.emoji, !reaction.me);
              releaseAfterPointer(event);
            }}
            tabIndex={-1}
            type="button"
          >
            <span aria-hidden="true" className="text-base leading-none">
              {reaction.emoji}
            </span>
            <span aria-hidden="true" className="font-medium tabular-nums">
              {reaction.count}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
