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
        "flex flex-col items-center justify-center gap-4 px-6 py-12 text-center",
        className,
      )}
    >
      {icon === undefined ? null : (
        <span className="flex size-14 items-center justify-center rounded-2xl border border-dashed bg-muted/50 text-muted-foreground">
          {icon}
        </span>
      )}
      <div className="space-y-1">
        <p className="text-base font-semibold">{title}</p>
        {description === undefined ? null : (
          <p className="mx-auto max-w-[34ch] text-body leading-relaxed text-balance text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
