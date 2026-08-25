import { Moon, Sun } from "lucide-react";

import { ChannelSidebar } from "@/components/layout/channel-sidebar";
import { MemberPanel } from "@/components/layout/member-panel";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { ServerRail } from "@/components/layout/server-rail";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConnectionStatus } from "@/features/realtime/components/connection-status";
import { useIsMobile } from "@/lib/use-media-query";
import { usePrefs } from "@/stores/prefs";

const PLACEHOLDERS = ["first", "second", "third", "fourth", "fifth"];

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

export function AppShell() {
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
            <ConnectionStatus />
            <ThemeToggle />
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {isMobile ? null : navigation}

          <main className="flex min-h-0 flex-1 flex-col">
            <h2 className="sr-only">Conversation</h2>
            <div className="flex flex-1 flex-col justify-end gap-3 overflow-hidden p-4">
              {PLACEHOLDERS.map((key) => (
                <div className="flex items-start gap-3" key={key}>
                  <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-full animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t p-3">
              <div className="h-9 animate-pulse rounded-lg bg-muted" />
            </div>
          </main>

          <MemberPanel />
        </div>
      </div>
    </TooltipProvider>
  );
}
