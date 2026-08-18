import { Moon, Sun } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConnectionStatus } from "@/features/realtime/components/connection-status";

export function App() {
  const [dark, setDark] = useState(false);

  function toggleTheme() {
    const next = !dark;

    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  }

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
