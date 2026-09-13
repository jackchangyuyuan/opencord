import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusWidget } from "@/features/realtime/components/status-widget";
import { cn } from "@/lib/cn";
import { usePrefs } from "@/stores/prefs";
import { useUi } from "@/stores/ui";

function ThemeToggle() {
  const theme = usePrefs((state) => state.theme);
  const toggleTheme = usePrefs((state) => state.toggleTheme);
  const dark = theme === "dark";

  return (
    <Button onClick={toggleTheme} size="sm" variant="ghost">
      {dark ? <Sun /> : <Moon />}
      {dark ? "Light" : "Dark"}
    </Button>
  );
}

export function StatusBar() {
  const flash = useUi((state) => state.architectureFlash);

  return (
    <footer
      className={cn(
        "flex h-statusbar shrink-0 items-center gap-4 border-t bg-sidebar px-4",
        flash > 0 && "attention-pulse",
      )}
      data-testid="status-bar"
      key={flash}
    >
      <StatusWidget />
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
      </div>
    </footer>
  );
}
