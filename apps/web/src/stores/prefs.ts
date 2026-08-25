import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

export const PREFS_STORAGE_KEY = "opencord:prefs";

interface PrefsState {
  theme: Theme;
  compact: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setCompact: (compact: boolean) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      theme: "light",
      compact: false,
      setTheme: (theme) => {
        set({ theme });
      },
      toggleTheme: () => {
        set({ theme: get().theme === "dark" ? "light" : "dark" });
      },
      setCompact: (compact) => {
        set({ compact });
      },
    }),
    { name: PREFS_STORAGE_KEY },
  ),
);

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

applyTheme(usePrefs.getState().theme);

usePrefs.subscribe((state) => {
  applyTheme(state.theme);
});
