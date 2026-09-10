import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function SettingsPage({
  actions,
  children,
  count,
  description,
  title,
  toolbar,
  total,
}: {
  actions?: ReactNode | undefined;
  children: ReactNode;
  count?: number | undefined;
  description?: string | undefined;
  title: string;
  toolbar?: ReactNode | undefined;
  total?: number | undefined;
}) {
  const badge =
    count === undefined
      ? null
      : total === undefined || total === count
        ? String(count)
        : `${String(count)} of ${String(total)}`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-2 pb-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="flex min-w-0 items-center gap-2 font-heading text-base leading-tight font-semibold">
            <span className="truncate">{title}</span>
            {badge === null ? null : (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                {badge}
              </span>
            )}
          </h2>
          {description === undefined ? null : (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {actions === undefined ? null : (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </header>

      {toolbar === undefined ? null : (
        <div className="shrink-0 pb-3">{toolbar}</div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

export function SettingsSection({
  actions,
  children,
  className,
  description,
  title,
}: {
  actions?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
  description?: string | undefined;
  title: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-sm font-medium">{title}</h3>
          {description === undefined ? null : (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {actions === undefined ? null : (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </section>
  );
}

export function SettingsList({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string | undefined;
  label: string;
}) {
  return (
    <ul
      aria-label={label}
      className={cn("flex flex-col divide-y divide-border/70", className)}
    >
      {children}
    </ul>
  );
}
