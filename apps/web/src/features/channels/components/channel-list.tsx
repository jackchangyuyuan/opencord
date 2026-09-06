import { useQuery } from "@tanstack/react-query";
import { Hash } from "lucide-react";
import { NavLink } from "react-router";

import { EmptyState } from "@/components/layout/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  serverChannelsQuery,
  useActiveChannelId,
} from "@/features/channels/api/queries";
import { UnreadBadge } from "@/features/channels/components/unread-badge";
import { cn } from "@/lib/cn";

export function ChannelList({ serverId }: { serverId: string | undefined }) {
  const activeChannelId = useActiveChannelId();

  const { data, isPending, isError } = useQuery({
    ...serverChannelsQuery(serverId ?? ""),
    enabled: serverId !== undefined,
  });

  if (serverId === undefined || isPending) {
    return (
      <div aria-hidden className="flex flex-col gap-1 p-2">
        {["a", "b", "c", "d"].map((key) => (
          <Skeleton className="h-7 rounded-lg" key={key} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="p-4 text-sm text-muted-foreground" role="alert">
        Could not load channels.
      </p>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        description="Somebody with permission can add the first one."
        title="No channels yet"
      />
    );
  }

  return (
    <ul className="flex flex-col gap-0.5 p-2">
      {data.map((channel) => (
        <li key={channel.id}>
          <NavLink
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
              "focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
              channel.id === activeChannelId &&
                "bg-muted font-medium text-foreground",
            )}
            to={`/app/channels/${channel.id}`}
            {...(channel.id === activeChannelId
              ? { "aria-current": "page" as const }
              : {})}
          >
            <Hash className="size-3.5 shrink-0" />
            <span
              className={cn(
                "truncate",
                channel.hasUnread && "font-semibold text-foreground",
              )}
            >
              {channel.name ?? "channel"}
            </span>
            <UnreadBadge label={channel.name ?? "channel"} state={channel} />
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
