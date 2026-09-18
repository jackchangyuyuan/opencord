import { type ReactNode, use } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { ResolvedViewProvider } from "@/features/channels/components/resolved-view-provider";
import { useActiveChannelId } from "@/features/channels/hooks/use-active-view";
import { PreparingViewContext } from "@/features/channels/lib/resolved-view";
import { MessageList } from "@/features/messages/components/message-list";
import { useGapFill } from "@/features/realtime/hooks/use-gap-fill";
import { usePresenceHeartbeat } from "@/features/realtime/hooks/use-presence-heartbeat";
import { useSocketEvents } from "@/features/realtime/hooks/use-socket-events";
import { cn } from "@/lib/cn";

function ConversationPane({
  children,
  hidden,
}: {
  children: ReactNode;
  hidden: boolean;
}) {
  return (
    <div
      className={cn("absolute inset-0 flex flex-col", hidden && "invisible")}
      {...(hidden ? { "aria-hidden": true, inert: true } : {})}
    >
      {children}
    </div>
  );
}

function AppBody() {
  const channelId = useActiveChannelId();
  const preparing = use(PreparingViewContext);
  const drawing = preparing?.view ?? null;

  useSocketEvents();
  useGapFill(channelId);
  usePresenceHeartbeat();

  const panes = [
    { channelId, hidden: false },
    ...(drawing === null
      ? []
      : [{ channelId: drawing.channelId, hidden: true }]),
  ];

  return (
    <AppShell>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {panes.map((pane) => (
          <ConversationPane hidden={pane.hidden} key={pane.channelId ?? "none"}>
            <MessageList
              channelId={pane.channelId}
              prepared={pane.hidden}
              {...(pane.hidden && preparing !== null
                ? { onDrawn: preparing.onDrawn }
                : {})}
            />
          </ConversationPane>
        ))}
      </div>
    </AppShell>
  );
}

export function AppRoute() {
  return (
    <ResolvedViewProvider>
      <AppBody />
    </ResolvedViewProvider>
  );
}
