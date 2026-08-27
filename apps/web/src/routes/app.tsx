import { AppShell } from "@/components/layout/app-shell";
import { useActiveChannelId } from "@/features/channels/api/queries";
import { MessageList } from "@/features/messages/components/message-list";
import { useSocketEvents } from "@/features/realtime/hooks/use-socket-events";

export function AppRoute() {
  const channelId = useActiveChannelId();

  useSocketEvents();

  return (
    <AppShell>
      <MessageList channelId={channelId} />
    </AppShell>
  );
}
