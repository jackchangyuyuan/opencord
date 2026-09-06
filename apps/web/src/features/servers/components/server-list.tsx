import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { serverChannelsQuery } from "@/features/channels/api/queries";
import { UnreadBadge } from "@/features/channels/components/unread-badge";
import {
  NOTHING_UNREAD,
  rollUp,
  type UnreadState,
} from "@/features/channels/lib/unread";
import { serversQuery } from "@/features/servers/api/queries";
import { cn } from "@/lib/cn";

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function ServerList({ activeServerId }: { activeServerId?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery(serversQuery);

  const channelLists = useQueries({
    queries: (data ?? []).map((server) => serverChannelsQuery(server.id)),
    combine: (results) =>
      new Map<string, UnreadState>(
        (data ?? []).map((server, index) => [
          server.id,
          rollUp(results[index]?.data ?? []),
        ]),
      ),
  });

  async function open(serverId: string): Promise<void> {
    const channels = await queryClient.query({
      ...serverChannelsQuery(serverId),
      staleTime: "static",
    });

    const [first] = channels;

    if (first !== undefined) {
      await navigate(`/app/channels/${first.id}`);
    }
  }

  if (isPending) {
    return (
      <div aria-hidden className="flex flex-col items-center gap-2 px-3">
        {["a", "b", "c"].map((key) => (
          <Skeleton className="size-10 rounded-2xl" key={key} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p
        className="px-2 text-center text-xs text-muted-foreground"
        role="alert"
      >
        Offline
      </p>
    );
  }

  return (
    <ul className="flex flex-col items-center gap-2 px-3">
      {data.map((server) => (
        <li key={server.id}>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  className={cn(
                    "relative rounded-2xl ring-offset-2 transition-[border-radius]",
                    "focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
                    server.id === activeServerId && "ring-2 ring-ring",
                  )}
                  onClick={() => {
                    open(server.id).catch(() => undefined);
                  }}
                  type="button"
                />
              }
            >
              <Avatar aria-hidden className="size-10 rounded-2xl">
                <AvatarImage alt="" src={server.iconUrl ?? undefined} />
                <AvatarFallback className="rounded-2xl">
                  {initials(server.name)}
                </AvatarFallback>
              </Avatar>
              <span className="sr-only">{server.name}</span>
              <UnreadBadge
                className="absolute -right-1 -bottom-1 ml-0"
                label={server.name}
                state={channelLists.get(server.id) ?? NOTHING_UNREAD}
              />
            </TooltipTrigger>
            <TooltipContent side="right">{server.name}</TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}
