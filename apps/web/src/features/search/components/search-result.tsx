import type { Message } from "@opencord/shared/types";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { serverChannelsQuery } from "@/features/channels/api/queries";
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
        className="flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => {
          void navigate(
            `/app/channels/${message.channelId}?around=${encodeURIComponent(message.id)}`,
          );
        }}
        type="button"
      >
        <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {author?.name ?? "Unknown"}
          </span>
          {channel === undefined ? null : <span>#{channel.name}</span>}
          <span className="ml-auto">
            {WHEN.format(new Date(message.createdAt))}
          </span>
        </span>
        <span className="line-clamp-3 text-sm">{message.content}</span>
      </button>
    </li>
  );
}
