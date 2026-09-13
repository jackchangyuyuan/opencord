import { useQuery } from "@tanstack/react-query";
import { Compass, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { UserBar } from "@/components/layout/user-bar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Truncated } from "@/components/ui/truncated";
import {
  useActiveServerId,
  useOnDirectMessages,
} from "@/features/channels/api/queries";
import { ChannelList } from "@/features/channels/components/channel-list";
import { CreateChannelDialog } from "@/features/channels/components/create-channel-dialog";
import { DmList } from "@/features/dms/components/dm-list";
import { StartDmDialog } from "@/features/dms/components/start-dm-dialog";
import { InviteDialog } from "@/features/invites/components/invite-dialog";
import { ServerSettingsDialog } from "@/features/server-settings/components/server-settings-dialog";
import { serversQuery } from "@/features/servers/api/queries";
import { useUi } from "@/stores/ui";

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 w-64 shrink-0 flex-col bg-sidebar md:w-72">
      {children}
    </div>
  );
}

function Head({ actions, title }: { actions?: ReactNode; title: string }) {
  return (
    <div className="flex h-header shrink-0 items-center gap-1.5 border-b px-4">
      <h2 className="min-w-0 flex-1 text-base leading-tight font-semibold tracking-tight">
        <Truncated value={title} />
      </h2>
      {actions}
    </div>
  );
}

export function ChannelSidebar() {
  const activeServerId = useActiveServerId();
  const openModal = useUi((state) => state.openModal);
  const { data: servers } = useQuery(serversQuery);

  const dmView = useOnDirectMessages();

  const activeServer = servers?.find((server) => server.id === activeServerId);
  const noServers = servers?.length === 0;

  if (dmView) {
    return (
      <Frame>
        <Head actions={<StartDmDialog />} title="Direct messages" />
        <ScrollArea className="min-h-0 flex-1">
          <DmList />
        </ScrollArea>
        <UserBar />
      </Frame>
    );
  }

  return (
    <Frame>
      <Head
        actions={
          activeServerId === undefined ? null : (
            <>
              <InviteDialog serverId={activeServerId} />
              <ServerSettingsDialog serverId={activeServerId} />
              <CreateChannelDialog serverId={activeServerId} />
            </>
          )
        }
        title={activeServer?.name ?? "Channels"}
      />
      <ScrollArea className="min-h-0 flex-1">
        {noServers ? (
          <EmptyState
            action={
              <Button
                onClick={() => {
                  openModal("create-server");
                }}
                size="sm"
              >
                <Plus />
                Create a server
              </Button>
            }
            description="Make one of your own, or open an invite link somebody sent you."
            icon={<Compass aria-hidden className="size-5" />}
            title="You are not in a server yet"
          />
        ) : (
          <ChannelList serverId={activeServerId} />
        )}
      </ScrollArea>
      <UserBar />
    </Frame>
  );
}
