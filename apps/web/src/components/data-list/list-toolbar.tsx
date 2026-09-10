import { X } from "lucide-react";
import type { ReactNode } from "react";

import { SearchField } from "@/components/data-list/search-field";
import { Button } from "@/components/ui/button";
import type { Identity } from "@/lib/identity";

export interface ActiveFilter {
  id: string;
  label: string;
  onRemove: () => void;
}

export function ListToolbar({
  children,
  filters = [],
  onClear,
  onSearchChange,
  searchLabel,
  searchPlaceholder,
  searchSuggest,
  searchValue,
}: {
  children?: ReactNode | undefined;
  filters?: ActiveFilter[] | undefined;
  onClear: () => void;
  onSearchChange: (next: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  searchSuggest?: readonly Identity[] | undefined;
  searchValue: string;
}) {
  const anything = filters.length > 0 || searchValue !== "";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          className="min-w-52 flex-1"
          label={searchLabel}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          suggest={searchSuggest}
          value={searchValue}
        />

        {children}
      </div>

      {anything ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((filter) => (
            <span
              className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/60 py-0.5 pr-0.5 pl-2 text-xs"
              key={filter.id}
            >
              <span className="min-w-0 truncate">{filter.label}</span>
              <Button
                aria-label={`Remove filter ${filter.label}`}
                className="size-4 rounded-full"
                onClick={filter.onRemove}
                size="icon-xs"
                variant="ghost"
              >
                <X className="size-3" />
              </Button>
            </span>
          ))}
          <Button
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={onClear}
            size="xs"
            variant="ghost"
          >
            Clear filters
          </Button>
        </div>
      ) : null}
    </div>
  );
}
