import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Fact({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-micro font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

export function FactList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return <dl className={cn("grid gap-x-6 gap-y-4", className)}>{children}</dl>;
}
