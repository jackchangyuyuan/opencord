import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveServerId } from "@/features/channels/api/queries";
import { searchMessagesQuery } from "@/features/search/api/queries";
import { SearchResult } from "@/features/search/components/search-result";
import { chipsOf, withoutChip } from "@/features/search/lib/filters";

const SIGIL = { from: "@", in: "#", before: "", after: "" } as const;

export function SearchPanel() {
  const serverId = useActiveServerId();

  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState("");

  const chips = chipsOf(draft);

  const { data, isFetching, isError } = useQuery({
    ...searchMessagesQuery({
      q: submitted,
      ...(serverId === undefined ? {} : { serverId }),
    }),
    enabled: submitted !== "",
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        className="flex flex-col gap-2 border-b px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(draft.trim());
        }}
        role="search"
      >
        <div className="flex gap-1.5">
          <Input
            aria-label="Search messages"
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            placeholder="from:@ana in:#general"
            value={draft}
          />
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

      <ScrollArea className="flex-1">
        {submitted === "" ? (
          <EmptyState
            description="Two hundred thousand messages, filtered by author, channel or date."
            icon={<Search aria-hidden className="size-5" />}
            title="Search this server's archive"
          />
        ) : isError ? (
          <p className="p-4 text-sm text-muted-foreground" role="alert">
            Could not run that search.
          </p>
        ) : data === undefined ? (
          <div aria-hidden className="flex flex-col gap-1 p-2">
            {["a", "b", "c", "d", "e"].map((key) => (
              <Skeleton className="h-12 rounded-lg" key={key} />
            ))}
          </div>
        ) : (
          <>
            {data.degraded ? (
              <p className="border-b px-4 py-2 text-xs text-muted-foreground">
                Showing all messages matching your filters.
              </p>
            ) : null}

            {data.data.length === 0 ? (
              <EmptyState
                description="Try fewer filters, or a different word."
                title="No messages matched"
              />
            ) : (
              <ul className="flex flex-col gap-0.5 p-2" aria-busy={isFetching}>
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
