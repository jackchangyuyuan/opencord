import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Search, SearchX, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { serverChannelsQuery } from "@/features/channels/api/queries";
import { useActiveServerId } from "@/features/channels/hooks/use-active-view";
import { serverMembersQuery } from "@/features/members/api/queries";
import { searchMessagesQuery } from "@/features/search/api/queries";
import { DateFilterField } from "@/features/search/components/date-filter-field";
import { SearchResult } from "@/features/search/components/search-result";
import { SearchSuggestions } from "@/features/search/components/search-suggestions";
import { resolveChannelFilters } from "@/features/search/lib/channel-filters";
import { chipsOf, withoutChip } from "@/features/search/lib/filters";
import {
  isDate,
  isDateKey,
  replaceToken,
  tokenAt,
} from "@/features/search/lib/query-token";
import {
  FILTER_TITLE,
  type Suggestion,
  suggestionOptionId,
  suggestionsFor,
} from "@/features/search/lib/suggestions";

const SIGIL = { from: "@", in: "#", before: "", after: "", on: "" } as const;

export function SearchPanel() {
  const serverId = useActiveServerId();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState<{
    q: string;
    channelIds: string[];
  }>({ q: "", channelIds: [] });
  const [caret, setCaret] = useState(0);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const { data: channels } = useQuery({
    ...serverChannelsQuery(serverId ?? ""),
    enabled: serverId !== undefined,
  });
  const { data: members } = useInfiniteQuery({
    ...serverMembersQuery(serverId ?? ""),
    enabled: serverId !== undefined,
  });

  const pickedChannelsRef = useRef(new Map<string, string>());

  const token = tokenAt(draft, caret);
  const suggestions = suggestionsFor(draft, token, {
    channels: channels ?? [],
    members: members?.pages.flatMap((page) => page.data) ?? [],
  });

  const dateKey = token.key !== null && isDateKey(token.key) ? token.key : null;
  const showSuggestions = open && dateKey === null && suggestions.length > 0;

  const chips = chipsOf(draft);

  const commit = (next: string, nextCaret: number, reopen: boolean) => {
    setDraft(next);
    setCaret(nextCaret);
    setHighlighted(0);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaret, nextCaret);
      setOpen(reopen);
    });
  };

  const choose = (suggestion: Suggestion) => {
    if (suggestion.kind === "channel") {
      pickedChannelsRef.current.set(
        suggestion.channelName.toLowerCase(),
        suggestion.channelId,
      );
    }

    const { value, caret: nextCaret } = replaceToken(
      draft,
      token,
      suggestion.insert,
      { trailingSpace: !suggestion.continues },
    );

    commit(value, nextCaret, true);
  };

  const chooseDay = (day: string) => {
    if (!isDate(day) || dateKey === null) {
      return;
    }

    const { value, caret: nextCaret } = replaceToken(
      draft,
      token,
      `${dateKey}:${day}`,
    );

    commit(value, nextCaret, false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && (showSuggestions || dateKey !== null)) {
      setOpen(false);
      event.preventDefault();
      return;
    }

    if (!showSuggestions) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1;

      setHighlighted(
        (current) => (current + step + suggestions.length) % suggestions.length,
      );
      event.preventDefault();
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      const picked = suggestions[highlighted];

      if (picked !== undefined) {
        choose(picked);
        event.preventDefault();
      }
    }
  };

  const { data, isFetching, isError } = useQuery({
    ...searchMessagesQuery({
      q: submitted.q,
      channelIds: submitted.channelIds,
      ...(serverId === undefined ? {} : { serverId }),
    }),
    enabled: submitted.q !== "",
  });

  const active = showSuggestions ? suggestions[highlighted] : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        className="flex flex-col gap-2.5 border-b px-4 py-4"
        onSubmit={(event) => {
          const q = draft.trim();

          event.preventDefault();
          setOpen(false);
          setSubmitted({
            q,
            channelIds: resolveChannelFilters(
              q,
              channels ?? [],
              pickedChannelsRef.current,
            ),
          });
        }}
        role="search"
      >
        <div className="relative flex gap-2">
          <div
            className="relative flex-1"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setOpen(false);
              }
            }}
          >
            <Input
              aria-activedescendant={
                active === undefined
                  ? undefined
                  : suggestionOptionId(listId, active.id)
              }
              aria-autocomplete="list"
              aria-controls={showSuggestions ? listId : undefined}
              aria-expanded={showSuggestions}
              aria-label="Search messages"
              autoComplete="off"
              onChange={(event) => {
                setDraft(event.target.value);
                setCaret(event.target.selectionStart ?? 0);
                setHighlighted(0);
                setOpen(true);
              }}
              onFocus={(event) => {
                setCaret(event.target.selectionStart ?? 0);
                setOpen(true);
              }}
              onKeyDown={onKeyDown}
              onSelect={(event) => {
                setCaret(event.currentTarget.selectionStart ?? 0);
              }}
              placeholder="Search, or pick a filter"
              ref={inputRef}
              role="combobox"
              value={draft}
            />

            <SearchSuggestions
              highlighted={highlighted}
              listId={listId}
              onHighlight={setHighlighted}
              onPick={choose}
              suggestions={showSuggestions ? suggestions : []}
            />

            {open && dateKey !== null ? (
              <DateFilterField
                key={`${dateKey}:${String(token.start)}`}
                label={FILTER_TITLE[dateKey]}
                onCommit={chooseDay}
                onEscape={() => {
                  setOpen(false);
                  inputRef.current?.focus();
                }}
                value={isDate(token.value) ? token.value : ""}
              />
            ) : null}
          </div>

          <Button aria-label="Search" size="icon" type="submit">
            <Search />
          </Button>
        </div>

        {chips.length === 0 ? null : (
          <ul className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <li key={chip.token}>
                <Button
                  aria-label={`Remove the ${chip.key} filter`}
                  onClick={() => {
                    setDraft(withoutChip(draft, chip));
                  }}
                  size="xs"
                  type="button"
                  variant="secondary"
                >
                  <span>{`${chip.key}:${SIGIL[chip.key]}${chip.value}`}</span>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <ScrollArea className="min-h-0 flex-1">
        {submitted.q === "" ? (
          <EmptyState
            description="Two hundred thousand messages, filtered by author, channel or date."
            icon={<Search aria-hidden className="size-5" />}
            title="Search this server's archive"
          />
        ) : isError ? (
          <p className="p-4 text-body text-muted-foreground" role="alert">
            Could not run that search.
          </p>
        ) : data === undefined ? (
          <div aria-hidden className="flex flex-col gap-1.5 p-3">
            {["a", "b", "c", "d", "e"].map((key) => (
              <Skeleton className="h-16 rounded-xl" key={key} />
            ))}
          </div>
        ) : (
          <>
            {data.degraded ? (
              <p className="border-b bg-muted/40 px-4 py-2.5 text-meta text-muted-foreground">
                Showing all messages matching your filters.
              </p>
            ) : null}

            {data.data.length === 0 ? (
              <EmptyState
                description="Try fewer filters, or a different word."
                icon={<SearchX aria-hidden className="size-5" />}
                title="No messages matched"
              />
            ) : (
              <ul className="flex flex-col gap-1 p-3" aria-busy={isFetching}>
                {data.data.map((message) => (
                  <SearchResult
                    key={message.id}
                    message={message}
                    serverId={serverId}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </ScrollArea>
    </div>
  );
}
