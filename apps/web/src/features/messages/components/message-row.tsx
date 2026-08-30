import { useQuery } from "@tanstack/react-query";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { MessageContent } from "@/features/messages/components/message-content";
import { PinnedIndicator } from "@/features/messages/components/pinned-indicator";
import { ReactionBar } from "@/features/messages/components/reaction-bar";
import { ReplyContext } from "@/features/messages/components/reply-context";
import type { ChatMessage } from "@/features/messages/hooks/use-send-message";
import { userQuery } from "@/features/users/api/queries";
import { cn } from "@/lib/cn";

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

export function MessageRow({
  message,
  grouped,
  onRetry,
  onDiscard,
  onToggleReaction,
  onReply,
  onTogglePin,
}: {
  message: ChatMessage;
  grouped: boolean;
  onRetry?: (message: ChatMessage) => void;
  onDiscard?: (message: ChatMessage) => void;
  onToggleReaction?: (messageId: string, emoji: string, add: boolean) => void;
  onReply?: (message: ChatMessage) => void;
  onTogglePin?: (message: ChatMessage) => void;
}) {
  const { data: author } = useQuery(userQuery(message.authorId));

  const name = author?.name ?? "Unknown";
  const at = new Date(message.createdAt);

  if (message.deletedAt !== null) {
    return (
      <article className="px-4 py-0.5 text-sm text-muted-foreground italic">
        This message was deleted.
      </article>
    );
  }

  const local = message.local;

  const row = (
    <article
      className={cn(
        "group relative flex gap-3 px-4 py-0.5 hover:bg-muted/40",
        local !== undefined && "opacity-60",
        local?.status === "failed" && "opacity-100",
      )}
      data-local-status={local?.status}
    >
      <div className="w-9 shrink-0">
        {grouped ? null : (
          <Avatar aria-hidden className="size-9">
            <AvatarImage alt="" src={author?.avatarUrl ?? undefined} />
            <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <ReplyContext channelId={message.channelId} replyTo={message.replyTo} />
        {grouped ? null : (
          <p className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{name}</span>
            <time
              className="text-xs text-muted-foreground"
              dateTime={message.createdAt}
            >
              {TIME.format(at)}
            </time>
            <PinnedIndicator pinnedAt={message.pinnedAt} />
          </p>
        )}
        <MessageContent
          channelId={message.channelId}
          content={message.content}
        />
        {message.editedAt === null ? null : (
          <span className="text-xs text-muted-foreground">(edited)</span>
        )}
        <ReactionBar
          disabled={onToggleReaction === undefined || local !== undefined}
          onToggle={(emoji, add) => {
            onToggleReaction?.(message.id, emoji, add);
          }}
          reactions={message.reactions}
        />
        {local?.status === "failed" ? (
          <p className="flex items-center gap-2 text-xs text-destructive">
            <span role="alert">{local.reason ?? "Could not send"}</span>
            {local.retry === "none" ? null : (
              <Button
                onClick={() => onRetry?.(message)}
                size="xs"
                variant="ghost"
              >
                Retry
              </Button>
            )}
            <Button
              onClick={() => onDiscard?.(message)}
              size="xs"
              variant="ghost"
            >
              Delete
            </Button>
          </p>
        ) : null}
      </div>
    </article>
  );

  if (
    (onReply === undefined && onTogglePin === undefined) ||
    local !== undefined
  ) {
    return row;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={row} />
      <ContextMenuContent>
        {onReply === undefined ? null : (
          <ContextMenuItem
            onClick={() => {
              onReply(message);
            }}
          >
            Reply
          </ContextMenuItem>
        )}
        {onTogglePin === undefined ? null : (
          <ContextMenuItem
            onClick={() => {
              onTogglePin(message);
            }}
          >
            {message.pinnedAt === null ? "Pin" : "Unpin"}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
