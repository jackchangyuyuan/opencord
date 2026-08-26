import type { Message } from "@opencord/shared/types";
import { useQuery } from "@tanstack/react-query";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageContent } from "@/features/messages/components/message-content";
import { userQuery } from "@/features/users/api/queries";

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

export function MessageRow({
  message,
  grouped,
}: {
  message: Message;
  grouped: boolean;
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

  return (
    <article className="flex gap-3 px-4 py-0.5 hover:bg-muted/40">
      <div className="w-9 shrink-0">
        {grouped ? null : (
          <Avatar aria-hidden className="size-9">
            <AvatarImage alt="" src={author?.avatarUrl ?? undefined} />
            <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {grouped ? null : (
          <p className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{name}</span>
            <time
              className="text-xs text-muted-foreground"
              dateTime={message.createdAt}
            >
              {TIME.format(at)}
            </time>
          </p>
        )}
        <MessageContent
          channelId={message.channelId}
          content={message.content}
        />
        {message.editedAt === null ? null : (
          <span className="text-xs text-muted-foreground">(edited)</span>
        )}
      </div>
    </article>
  );
}
