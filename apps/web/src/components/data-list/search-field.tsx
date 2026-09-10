import { Search, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  type Identity,
  isHandleTerm,
  rankSuggestions,
  toHandle,
} from "@/lib/identity";

export function SearchField({
  className,
  label,
  onChange,
  placeholder,
  suggest,
  value,
}: {
  className?: string | undefined;
  label: string;
  onChange: (next: string) => void;
  placeholder: string;
  suggest?: readonly Identity[] | undefined;
  value: string;
}) {
  const inputId = useId();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const matches =
    suggest === undefined || !isHandleTerm(value)
      ? []
      : rankSuggestions(value, suggest);

  const showing = open && matches.length > 0;
  const chosen = showing
    ? matches[Math.min(active, matches.length - 1)]
    : undefined;

  const pick = (identity: Identity) => {
    onChange(toHandle(identity.username));
    setOpen(false);
    setActive(0);
    inputRef.current?.focus();
  };

  return (
    <div className={cn("relative", className)}>
      <label className="sr-only" htmlFor={inputId}>
        {label}
      </label>

      <div
        className={cn(
          "flex h-8 items-center gap-1 rounded-lg border border-input bg-transparent pr-1 pl-2 transition-colors",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          "dark:bg-input/30",
        )}
      >
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />

        <Input
          {...(showing
            ? {
                "aria-activedescendant": `${listId}-${chosen?.id ?? ""}`,
                "aria-controls": listId,
              }
            : {})}
          aria-autocomplete={suggest === undefined ? undefined : "list"}
          aria-expanded={suggest === undefined ? undefined : showing}
          autoComplete="off"
          className={cn(
            "h-auto min-w-0 flex-1 self-stretch border-0 bg-transparent px-0.5 py-0 text-sm shadow-none",
            "focus-visible:border-0 focus-visible:ring-0",
            "[&::-webkit-search-cancel-button]:hidden",
            "dark:bg-transparent",
          )}
          id={inputId}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (showing) {
                setOpen(false);
              } else if (value !== "") {
                onChange("");
              } else {
                return;
              }

              event.preventDefault();
              event.stopPropagation();

              return;
            }

            if (!showing) {
              return;
            }

            if (event.key === "ArrowDown") {
              setActive((index) => (index + 1) % matches.length);
              event.preventDefault();
            } else if (event.key === "ArrowUp") {
              setActive(
                (index) => (index - 1 + matches.length) % matches.length,
              );
              event.preventDefault();
            } else if (event.key === "Enter" && chosen !== undefined) {
              pick(chosen);
              event.preventDefault();
            }
          }}
          placeholder={placeholder}
          ref={inputRef}
          role={suggest === undefined ? undefined : "combobox"}
          spellCheck={false}
          type="search"
          value={value}
        />

        {value === "" ? null : (
          <Button
            aria-label="Clear search"
            className="size-6 shrink-0"
            onClick={() => {
              onChange("");
              setOpen(false);
              inputRef.current?.focus();
            }}
            size="icon-xs"
            variant="ghost"
          >
            <X />
          </Button>
        )}
      </div>

      {showing ? (
        <ul
          className="absolute inset-x-0 top-full z-(--z-overlay) mt-1 flex flex-col rounded-lg bg-popover p-1 shadow-md ring-1 ring-foreground/10"
          id={listId}
          role="listbox"
        >
          {matches.map((identity, index) => (
            <li
              aria-selected={identity.id === chosen?.id}
              className={cn(
                "flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-sm",
                identity.id === chosen?.id &&
                  "bg-accent text-accent-foreground",
              )}
              id={`${listId}-${identity.id}`}
              key={identity.id}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(identity);
              }}
              onMouseEnter={() => {
                setActive(index);
              }}
              role="option"
            >
              <span className="min-w-0 truncate font-medium">
                {toHandle(identity.username)}
              </span>

              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-right text-xs",
                  identity.id === chosen?.id
                    ? "text-accent-foreground"
                    : "text-muted-foreground",
                )}
              >
                {identity.name}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
