import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function MetaLine({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground",
        "*:shrink-0 *:not-first:before:mr-1.5 *:not-first:before:content-['·']",
        className,
      )}
    >
      {children}
    </span>
  );
}
