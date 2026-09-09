import { cn } from "@/lib/cn";

export const RAIL_TILE = cn(
  "group/tile relative flex size-12 items-center justify-center rounded-2xl border border-transparent transition-colors duration-150",
  "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
);

export const RAIL_GUTTER = "flex flex-col items-center gap-2 px-4 py-1.5";

export function railIndicator(state: "active" | "unread" | "idle"): string {
  return cn(
    "pointer-events-none absolute top-1/2 -left-3 w-1.5 -translate-y-1/2 rounded-r-full bg-foreground transition-all duration-150",
    state === "active" && "h-8",
    state === "unread" && "h-2.5",
    state === "idle" && "h-2.5 scale-0 group-hover/tile:scale-100",
  );
}

export function navRow(active: boolean): string {
  return cn(
    "group/row relative flex items-center gap-2.5 rounded-lg py-2 pr-2.5 pl-3 text-body transition-colors duration-100",
    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
    active
      ? "bg-accent font-semibold text-accent-foreground"
      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
  );
}

export function navMarker(active: boolean): string {
  return cn(
    "pointer-events-none absolute top-1/2 left-0 w-1 -translate-y-1/2 rounded-r-full bg-brand transition-all duration-150",
    active ? "h-5" : "h-0",
  );
}

export const NAV_ROW_LANE = "w-13";
