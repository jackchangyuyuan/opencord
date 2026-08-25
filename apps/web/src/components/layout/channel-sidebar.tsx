import { useQuery } from "@tanstack/react-query";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useActiveServerId } from "@/features/channels/api/queries";
import { ChannelList } from "@/features/channels/components/channel-list";
import { serversQuery } from "@/features/servers/api/queries";

export function ChannelSidebar() {
  const activeServerId = useActiveServerId();
  const { data: servers } = useQuery(serversQuery);

  const activeServer = servers?.find((server) => server.id === activeServerId);

  return (
    <div className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
      <div className="border-b px-4 py-3">
        <h2 className="truncate text-sm font-semibold">
          {activeServer?.name ?? "Channels"}
        </h2>
      </div>
      <ScrollArea className="flex-1">
        <ChannelList serverId={activeServerId} />
      </ScrollArea>
    </div>
  );
}
