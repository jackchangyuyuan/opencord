import { AppShell } from "@/components/layout/app-shell";
import { useActiveChannelId } from "@/features/channels/api/queries";
import { MessageList } from "@/features/messages/components/message-list";

export function AppRoute() {
  const channelId = useActiveChannelId();

  return (
    <AppShell>
      <MessageList channelId={channelId} />
    </AppShell>
  );
}
