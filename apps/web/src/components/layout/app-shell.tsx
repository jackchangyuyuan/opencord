import { Moon, Search, Sun, Users } from "lucide-react";
import type { ReactNode } from "react";

import { ChannelSidebar } from "@/components/layout/channel-sidebar";
import { MemberPanel } from "@/components/layout/member-panel";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { ServerRail } from "@/components/layout/server-rail";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StatusPicker } from "@/features/realtime/components/status-picker";
import { StatusWidget } from "@/features/realtime/components/status-widget";
import { useIsMobile } from "@/lib/use-media-query";
import { usePrefs } from "@/stores/prefs";
import { useUi } from "@/stores/ui";

function ThemeToggle() {
  const theme = usePrefs((state) => state.theme);
  const toggleTheme = usePrefs((state) => state.toggleTheme);
  const dark = theme === "dark";

  return (
    <Button onClick={toggleTheme} size="sm" variant="outline">
      {dark ? <Sun /> : <Moon />}
      {dark ? "Light" : "Dark"}
    </Button>
  );
}

function RightPanelToggle() {
  const rightPanel = useUi((state) => state.rightPanel);
  const setRightPanel = useUi((state) => state.setRightPanel);
  const search = rightPanel === "search";

  return (
    <Button
      onClick={() => {
        setRightPanel(search ? "members" : "search");
      }}
      size="sm"
      variant="outline"
    >
      {search ? <Users /> : <Search />}
      {search ? "Members" : "Search"}
    </Button>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const isMobile = useIsMobile();

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
        <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
          {isMobile ? <MobileDrawer>{navigation}</MobileDrawer> : null}
          <h1 className="text-sm font-semibold">OpenCord</h1>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <StatusPicker />
            <StatusWidget />
            <RightPanelToggle />
            <ThemeToggle />
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {isMobile ? null : navigation}

          <main className="flex min-h-0 flex-1 flex-col">
            <h2 className="sr-only">Conversation</h2>
            {children}
          </main>

          <MemberPanel />
        </div>
      </div>
    </TooltipProvider>
  );
}
