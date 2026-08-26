import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { serverChannelsQuery } from "@/features/channels/api/queries";
import { serversQuery } from "@/features/servers/api/queries";
import { cn } from "@/lib/cn";

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function ServerList({ activeServerId }: { activeServerId?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery(serversQuery);

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
      <ul className="flex flex-col items-center gap-2 px-3">
        {["a", "b", "c"].map((key) => (
          <li key={key}>
            <div className="size-10 animate-pulse rounded-2xl bg-muted" />
          </li>
        ))}
      </ul>
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
                    "rounded-2xl ring-offset-2 transition-[border-radius]",
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
                <AvatarImage alt="" src={server.iconKey ?? undefined} />
                <AvatarFallback className="rounded-2xl">
                  {initials(server.name)}
                </AvatarFallback>
              </Avatar>
              <span className="sr-only">{server.name}</span>
            </TooltipTrigger>
            <TooltipContent side="right">{server.name}</TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}
