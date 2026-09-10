import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";

export interface FilterOption {
  value: string;
  label: string;
  swatch?: string | undefined;
  hint?: string | undefined;
}

export function FilterMenu({
  label,
  multiple = false,
  onChange,
  options,
  selected,
}: {
  label: string;
  multiple?: boolean | undefined;
  onChange: (next: string[]) => void;
  options: FilterOption[];
  selected: string[];
}) {
  const active = selected.length > 0;

  const chosen = options.filter((option) => selected.includes(option.value));

  const summary =
    chosen.length === 0
      ? label
      : chosen.length === 1 && chosen[0] !== undefined
        ? `${label}: ${chosen[0].label}`
        : `${label} · ${String(chosen.length)}`;

  const toggle = (value: string) => {
    if (!multiple) {
      onChange(selected.includes(value) ? [] : [value]);

      return;
    }

    onChange(
      selected.includes(value)
        ? selected.filter((entry) => entry !== value)
        : [...selected, value],
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className={cn(
              "max-w-52 justify-between font-normal",
              active && "border-ring/60 bg-muted font-medium text-foreground",
            )}
            size="sm"
            variant="outline"
          />
        }
      >
        <span className="truncate">{summary}</span>
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="max-h-72 w-auto max-w-80 min-w-52"
        tabIndex={0}
      >
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Nothing to filter by yet
          </p>
        ) : null}

        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          const body = (
            <>
              {option.swatch === undefined ? null : (
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full bg-current"
                  style={{ color: option.swatch }}
                />
              )}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.hint === undefined ? null : (
                <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground tabular-nums">
                  {option.hint}
                </span>
              )}
            </>
          );

          return multiple ? (
            <DropdownMenuCheckboxItem
              checked={isSelected}
              closeOnClick={false}
              key={option.value}
              onCheckedChange={() => {
                toggle(option.value);
              }}
            >
              {body}
            </DropdownMenuCheckboxItem>
          ) : (
            <DropdownMenuItem
              key={option.value}
              onClick={() => {
                toggle(option.value);
              }}
            >
              {body}
              <Check className={cn("ml-auto", isSelected ? "" : "invisible")} />
            </DropdownMenuItem>
          );
        })}

        {active ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onChange([]);
              }}
            >
              Clear {label.toLowerCase()}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MoreFilters({
  children,
  count,
  label = "More filters",
}: {
  children: ReactNode;
  count: number;
  label?: string | undefined;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className={cn(
              "font-normal",
              count > 0 &&
                "border-ring/60 bg-muted font-medium text-foreground",
            )}
            size="sm"
            variant="outline"
          />
        }
      >
        {count === 0 ? label : `${label} · ${String(count)}`}
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto min-w-56" tabIndex={0}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
