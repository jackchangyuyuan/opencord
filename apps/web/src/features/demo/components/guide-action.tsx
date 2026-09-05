import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function GuideAction({
  disabled = false,
  icon,
  label,
  onSelect,
  proves,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onSelect: () => void;
  proves: string;
}) {
  return (
    <li>
      <Button
        className="h-auto w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left"
        disabled={disabled}
        onClick={onSelect}
        type="button"
        variant="ghost"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {label}
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {proves}
        </span>
      </Button>
    </li>
  );
}
