import { AppShell } from "@/components/layout/app-shell";
import { useActiveChannelId } from "@/features/channels/api/queries";
import { MessageList } from "@/features/messages/components/message-list";
import { useGapFill } from "@/features/realtime/hooks/use-gap-fill";
import { usePresenceHeartbeat } from "@/features/realtime/hooks/use-presence-heartbeat";
import { useSocketEvents } from "@/features/realtime/hooks/use-socket-events";

export function AppRoute() {
  const channelId = useActiveChannelId();

  useSocketEvents();
  useGapFill(channelId);
  usePresenceHeartbeat();

  return (
    <AppShell>
      <MessageList channelId={channelId} key={channelId} />
    </AppShell>
  );
}
