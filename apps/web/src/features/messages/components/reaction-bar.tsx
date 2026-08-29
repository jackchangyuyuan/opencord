import type { MessageReaction } from "@opencord/shared/types";

import { Button } from "@/components/ui/button";
import { EmojiPicker } from "@/features/messages/components/emoji-picker";

export function ReactionBar({
  disabled = false,
  onToggle,
  reactions,
}: {
  disabled?: boolean;
  onToggle: (emoji: string, add: boolean) => void;
  reactions: readonly MessageReaction[];
}) {
  return (
    <>
      {reactions.length === 0 ? null : (
        <ul className="mt-0.5 flex flex-wrap items-center gap-1">
          {reactions.map((reaction) => (
            <li key={reaction.emoji}>
              <Button
                aria-label={`${reaction.emoji} ${String(reaction.count)}`}
                aria-pressed={reaction.me}
                disabled={disabled}
                onClick={() => {
                  onToggle(reaction.emoji, !reaction.me);
                }}
                size="xs"
                variant={reaction.me ? "secondary" : "ghost"}
              >
                <span aria-hidden="true">{reaction.emoji}</span>
                <span aria-hidden="true" className="tabular-nums">
                  {reaction.count}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {disabled ? null : (
        <div className="absolute top-0 right-3 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <EmojiPicker
            onPick={(emoji) => {
              onToggle(emoji, true);
            }}
          />
        </div>
      )}
    </>
  );
}
