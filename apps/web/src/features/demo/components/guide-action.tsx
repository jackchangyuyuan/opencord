import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function GuideAction({
  disabled = false,
  icon,
  index,
  label,
  onSelect,
  proves,
}: {
  disabled?: boolean;
  icon: ReactNode;
  index: number;
  label: string;
  onSelect: () => void;
  proves: string;
}) {
  return (
    <li>
      <button
        className="group/action flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-100 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45"
        disabled={disabled}
        onClick={onSelect}
        type="button"
      >
        <span
          aria-hidden
          className="mt-px flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover/action:bg-brand group-hover/action:text-brand-foreground"
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-body leading-5 font-medium">
            <span className="min-w-0">{label}</span>
            <span
              aria-hidden
              className="ml-auto text-micro text-muted-foreground tabular-nums"
            >
              {index}
            </span>
          </span>
          <span className="block text-meta leading-4 text-muted-foreground">
            {proves}
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/action:opacity-100"
        />
      </button>
    </li>
  );
}
