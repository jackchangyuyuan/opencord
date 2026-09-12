import {
  type SettingsGroup,
  type SettingsPageId,
} from "@/features/server-settings/lib/pages";
import { cn } from "@/lib/cn";

export function SettingsNav({
  groups,
  onSelect,
  page,
  panelId,
}: {
  groups: SettingsGroup[];
  onSelect: (page: SettingsPageId) => void;
  page: SettingsPageId;
  panelId: string;
}) {
  return (
    <nav
      aria-label="Server settings"
      className="flex shrink-0 flex-col gap-4 overflow-y-auto sm:w-44"
    >
      {groups.map((group) => (
        <div className="flex flex-col gap-1" key={group.label}>
          <h2 className="px-2 text-micro font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            {group.label}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {group.pages.map((entry) => {
              const Icon = entry.icon;
              const current = entry.id === page;

              return (
                <li key={entry.id}>
                  <button
                    aria-controls={panelId}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                      "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      current
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                    onClick={() => {
                      onSelect(entry.id);
                    }}
                    type="button"
                  >
                    <Icon aria-hidden className="size-4 shrink-0" />
                    <span className="min-w-0 truncate">{entry.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
