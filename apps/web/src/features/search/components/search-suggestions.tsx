import { Filter, Hash } from "lucide-react";
import type { ReactNode } from "react";

import {
  type Suggestion,
  suggestionOptionId,
} from "@/features/search/lib/suggestions";
import { UserAvatar } from "@/features/users/components/user-avatar";
import { cn } from "@/lib/cn";

function Glyph({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand"
    >
      {children}
    </span>
  );
}

export function SearchSuggestions({
  listId,
  suggestions,
  highlighted,
  onHighlight,
  onPick,
}: {
  listId: string;
  suggestions: readonly Suggestion[];
  highlighted: number;
  onHighlight: (index: number) => void;
  onPick: (suggestion: Suggestion) => void;
}) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <ul
      aria-label="Search filters"
      className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-2xl border bg-popover p-1.5 shadow-e3"
      id={listId}
      role="listbox"
    >
      {suggestions.map((suggestion, index) => {
        const selected = index === highlighted;

        return (
          <li
            aria-selected={selected}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-1.5",
              selected && "bg-accent text-accent-foreground",
            )}
            id={suggestionOptionId(listId, suggestion.id)}
            key={suggestion.id}
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(suggestion);
            }}
            onMouseEnter={() => {
              onHighlight(index);
            }}
            role="option"
          >
            {suggestion.kind === "user" ? (
              <UserAvatar
                avatarUrl={suggestion.avatarUrl}
                name={suggestion.title}
                ring="ring-popover"
                showPresence={false}
                size="sm"
                userId={suggestion.userId}
              />
            ) : (
              <Glyph>
                {suggestion.kind === "channel" ? (
                  <Hash className="size-4" />
                ) : (
                  <Filter className="size-4" />
                )}
              </Glyph>
            )}

            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="truncate text-body font-medium">
                {suggestion.title}
              </span>
              {suggestion.hint === null ? null : (
                <span
                  className={cn(
                    "min-w-0 shrink truncate text-meta",
                    selected
                      ? "text-accent-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {suggestion.hint}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
