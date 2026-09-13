import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router";

import {
  RAIL_GUTTER,
  RAIL_TILE,
  railIndicator,
} from "@/components/layout/nav-styles";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { serverChannelsQuery } from "@/features/channels/api/queries";
import { UnreadBadge } from "@/features/channels/components/unread-badge";
import {
  badgeCount,
  NOTHING_UNREAD,
  rollUp,
  type UnreadState,
} from "@/features/channels/lib/unread";
import { serversQuery } from "@/features/servers/api/queries";
import { cn } from "@/lib/cn";
import { tintHue } from "@/lib/tint";

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);

  if (words.length > 1) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  }

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
      <div aria-hidden className={RAIL_GUTTER}>
        {["a", "b", "c"].map((key) => (
          <Skeleton className="size-12 rounded-2xl" key={key} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p
        className="px-2 text-center text-meta text-muted-foreground"
        role="alert"
      >
        Offline
      </p>
    );
  }

  return (
    <ul className={RAIL_GUTTER}>
      {data.map((server) => {
        const unread = channelLists.get(server.id) ?? NOTHING_UNREAD;
        const active = server.id === activeServerId;

        return (
          <li key={server.id}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    className={cn(
                      RAIL_TILE,
                      "server-tint overflow-visible text-base font-semibold",
                      active &&
                        "ring-2 ring-brand/70 ring-offset-2 ring-offset-rail",
                    )}
                    onClick={() => {
                      open(server.id).catch(() => undefined);
                    }}
                    style={
                      { "--tint-hue": tintHue(server.id) } as CSSProperties
                    }
                    type="button"
                  />
                }
              >
                <span
                  aria-hidden
                  className={railIndicator(
                    active
                      ? "active"
                      : unread.hasUnread || badgeCount(unread) > 0
                        ? "unread"
                        : "idle",
                  )}
                />
                {server.iconUrl === null ? (
                  <span aria-hidden className="tracking-tight">
                    {initials(server.name)}
                  </span>
                ) : (
                  <img
                    alt=""
                    className="size-full rounded-2xl object-cover"
                    src={server.iconUrl}
                  />
                )}
                <span className="sr-only">{server.name}</span>
                <UnreadBadge
                  className="absolute -right-1 -bottom-1 ml-0 ring-2 ring-rail"
                  countOnly
                  label={server.name}
                  state={unread}
                />
              </TooltipTrigger>
              <TooltipContent side="right">{server.name}</TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
