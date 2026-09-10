import { SearchX } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function NoMatches({
  noun,
  onClear,
}: {
  noun: string;
  onClear: () => void;
}) {
  return (
    <EmptyState
      action={
        <Button onClick={onClear} size="sm" variant="outline">
          Clear filters
        </Button>
      }
      className="flex-1 justify-center gap-3 py-10"
      description="Nothing here matches the search and filters above."
      icon={<SearchX aria-hidden className="size-5" />}
      title={`No ${noun} match these filters`}
    />
  );
}

export function NothingYet({
  action,
  description,
  icon,
  title,
}: {
  action?: ReactNode | undefined;
  description?: string | undefined;
  icon: ReactNode;
  title: string;
}) {
  return (
    <EmptyState
      className="flex-1 justify-center gap-3 py-10"
      icon={icon}
      title={title}
      {...(action === undefined ? {} : { action })}
      {...(description === undefined ? {} : { description })}
    />
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-1 pt-1">
      {Array.from({ length: rows }, (_, index) => (
        <div
          className="flex items-center gap-3 py-2"
          key={index}
          style={{ opacity: 1 - index * (0.6 / rows) }}
        >
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="ml-auto h-3.5 w-24" />
        </div>
      ))}
    </div>
  );
}

export function ListError({ children }: { children: string }) {
  return (
    <p className="py-6 text-sm text-destructive" role="alert">
      {children}
    </p>
  );
}
