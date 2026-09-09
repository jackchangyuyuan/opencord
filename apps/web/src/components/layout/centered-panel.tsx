import type { ReactNode } from "react";
import { Link } from "react-router";

import { BrandMark } from "@/components/ui/brand-mark";

export function CenteredPanel({
  children,
  description,
  footer,
  title,
  wide = false,
}: {
  children?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  title: string;
  wide?: boolean;
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-sidebar p-6">
      <Link
        className="flex items-center gap-2 rounded-lg px-2 py-1 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        to="/"
      >
        <span
          aria-hidden
          className="flex size-9 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-e1"
        >
          <BrandMark className="size-5" />
        </span>
        <span className="text-base font-semibold tracking-tight">OpenCord</span>
      </Link>

      <div
        className={`w-full rounded-2xl border bg-card p-7 shadow-e2 ${wide ? "max-w-lg" : "max-w-md"}`}
      >
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description === undefined ? null : (
          <p className="mt-1 text-body leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
        {children === undefined ? null : <div className="mt-6">{children}</div>}
      </div>

      {footer === undefined ? null : (
        <p className="text-body text-muted-foreground">{footer}</p>
      )}
    </main>
  );
}
