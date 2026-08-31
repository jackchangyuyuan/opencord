import { Permissions } from "@opencord/shared/permissions";
import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useActiveChannelId,
  useActiveServerId,
} from "@/features/channels/api/queries";
import { ChannelList } from "@/features/channels/components/channel-list";
import { ChannelSettingsDialog } from "@/features/channels/components/channel-settings-dialog";
import { CreateChannelDialog } from "@/features/channels/components/create-channel-dialog";
import {
  has,
  useChannelPermissions,
} from "@/features/permissions/hooks/use-permissions";
import { serversQuery } from "@/features/servers/api/queries";
import { ServerSettingsDialog } from "@/features/servers/components/server-settings-dialog";
import { useUi } from "@/stores/ui";

export function ChannelSidebar() {
  const activeServerId = useActiveServerId();
  const activeChannelId = useActiveChannelId();
  const channelPermissions = useChannelPermissions(activeChannelId);
  const openModal = useUi((state) => state.openModal);
  const { data: servers } = useQuery(serversQuery);

  const activeServer = servers?.find((server) => server.id === activeServerId);

  const mayManageChannel =
    activeChannelId !== undefined &&
    has(channelPermissions, Permissions.MANAGE_CHANNELS);

  return (
    <div className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex items-center gap-1 border-b px-4 py-3">
        <h2 className="flex-1 truncate text-sm font-semibold">
          {activeServer?.name ?? "Channels"}
        </h2>
        {mayManageChannel ? (
          <Button
            aria-label="Channel settings"
            onClick={() => {
              openModal("channel-settings");
            }}
            size="icon-xs"
            variant="ghost"
          >
            <Settings />
          </Button>
        ) : null}
        {activeServerId === undefined ? null : (
          <>
            <ServerSettingsDialog serverId={activeServerId} />
            <CreateChannelDialog serverId={activeServerId} />
          </>
        )}
      </div>
      <ScrollArea className="flex-1">
        <ChannelList serverId={activeServerId} />
      </ScrollArea>
      {activeChannelId === undefined ? null : (
        <ChannelSettingsDialog channelId={activeChannelId} />
      )}
    </div>
  );
}
