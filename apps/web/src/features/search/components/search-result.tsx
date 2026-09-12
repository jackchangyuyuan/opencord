import type { Message } from "@opencord/shared/types";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { serverChannelsQuery } from "@/features/channels/api/queries";
import { MentionText } from "@/features/messages/components/mention-text";
import { userQuery } from "@/features/users/api/queries";

const WHEN = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function SearchResult({
  message,
  serverId,
}: {
  message: Message;
  serverId: string | undefined;
}) {
  const navigate = useNavigate();

  const { data: author } = useQuery(userQuery(message.authorId));
  const { data: channels } = useQuery({
    ...serverChannelsQuery(serverId ?? ""),
    enabled: serverId !== undefined,
  });

  const channel = channels?.find((entry) => entry.id === message.channelId);

  return (
    <li>
      <button
        className="flex w-full flex-col gap-1 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors duration-100 hover:border-border hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={() => {
          void navigate(
            `/app/channels/${message.channelId}?around=${encodeURIComponent(message.id)}`,
          );
        }}
        type="button"
      >
        <span className="flex min-w-0 items-baseline gap-1.5 text-meta text-muted-foreground">
          <span className="truncate font-medium text-foreground">
            {author?.name ?? "Unknown"}
          </span>
          {channel === undefined ? null : (
            <span className="shrink-0 rounded bg-muted px-1 py-px">
              #{channel.name}
            </span>
          )}
        </span>
        <span className="line-clamp-3 text-body leading-relaxed">
          <MentionText
            channelId={message.channelId}
            content={message.content}
          />
        </span>
        <span className="text-micro text-muted-foreground">
          {WHEN.format(new Date(message.createdAt))}
        </span>
      </button>
    </li>
  );
}
