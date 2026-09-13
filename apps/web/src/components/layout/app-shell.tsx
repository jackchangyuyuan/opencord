import type { ReactNode } from "react";

import { ChannelHeader } from "@/components/layout/channel-header";
import { ChannelSidebar } from "@/components/layout/channel-sidebar";
import { MemberPanel } from "@/components/layout/member-panel";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { ServerRail } from "@/components/layout/server-rail";
import { StatusBar } from "@/components/layout/status-bar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChannelSettingsDialog } from "@/features/channels/components/channel-settings-dialog";
import { ClaimDialog } from "@/features/demo/components/claim-dialog";
import { ClaimPrompt } from "@/features/demo/components/claim-prompt";
import { GuidePanel } from "@/features/demo/components/guide-panel";
import { ProfileDialog } from "@/features/users/components/profile-dialog";
import { useIsMobile } from "@/lib/use-media-query";
import { useUi } from "@/stores/ui";

export function AppShell({ children }: { children?: ReactNode }) {
  const isMobile = useIsMobile();
  const channelSettingsId = useUi((state) => state.channelSettingsId);

  const navigation = (
    <nav
      aria-label="Servers and channels"
      className="flex min-h-0 shrink-0 flex-row"
    >
      <ServerRail />
      <ChannelSidebar />
    </nav>
  );

  return (
    <TooltipProvider>
      <div className="flex h-svh flex-col bg-background text-foreground">
        <a
          className="sr-only rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
          href="#main"
        >
          Skip to the conversation
        </a>

        <h1 className="sr-only">OpenCord</h1>

        <div className="flex min-h-0 flex-1">
          {isMobile ? null : navigation}

          <main
            className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"
            id="main"
            tabIndex={-1}
          >
            <ChannelHeader
              {...(isMobile
                ? { drawer: <MobileDrawer>{navigation}</MobileDrawer> }
                : {})}
            />
            {children}
          </main>

          <MemberPanel />
        </div>

        <ClaimPrompt />
        <StatusBar />

        <GuidePanel />
        <ClaimDialog />
        <ProfileDialog />
        {channelSettingsId === null ? null : (
          <ChannelSettingsDialog
            channelId={channelSettingsId}
            key={channelSettingsId}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
