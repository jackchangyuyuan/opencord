import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function EmptyState({
  action,
  className,
  description,
  icon,
  title,
}: {
  action?: ReactNode;
  className?: string;
  description?: string;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 p-6 text-center",
        className,
      )}
    >
      {icon === undefined ? null : (
        <span className="text-muted-foreground">{icon}</span>
      )}
      <p className="text-sm font-medium">{title}</p>
      {description === undefined ? null : (
        <p className="max-w-prose text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
