import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConnectionStatus } from "@/features/realtime/components/connection-status";
import { usePrefs } from "@/stores/prefs";

export function App() {
  const theme = usePrefs((state) => state.theme);
  const toggleTheme = usePrefs((state) => state.toggleTheme);
  const dark = theme === "dark";

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">OpenCord</h1>
      <ConnectionStatus />
      <Button variant="outline" size="sm" onClick={toggleTheme}>
        {dark ? <Sun /> : <Moon />}
        {dark ? "Light" : "Dark"}
      </Button>
    </main>
  );
}
