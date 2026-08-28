import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import { channelMessagesQuery } from "@/features/messages/api/queries";
import { Composer } from "@/features/messages/components/composer";
import { DateDivider } from "@/features/messages/components/date-divider";
import { MessageRow } from "@/features/messages/components/message-row";
import { NewMessagesDivider } from "@/features/messages/components/new-messages-divider";
import { TypingRow } from "@/features/messages/components/typing-row";
import { useMarkRead } from "@/features/messages/hooks/use-mark-read";
import { useSendMessage } from "@/features/messages/hooks/use-send-message";
import {
  buildRows,
  flattenPages,
  prependedCount,
} from "@/features/messages/lib/rows";
import { currentUserQuery } from "@/features/users/api/queries";

const FIRST_ITEM_BASE = 1_000_000;

export function MessageList({
  channelId,
  initialTopMostItemIndex,
}: {
  channelId: string | undefined;
  initialTopMostItemIndex?: number;
}) {
  const listRef = useRef<VirtuosoHandle>(null);
  const enabled = channelId !== undefined;

  const [searchParams] = useSearchParams();
  const jumpTo = searchParams.get("around");

  const messages = useInfiniteQuery({
    ...channelMessagesQuery(channelId ?? "", jumpTo),
    enabled,
  });

  const { data: me } = useQuery(currentUserQuery);
  const { retry, discard } = useSendMessage(channelId ?? "");
  const { dividerAfterMessageId, markRead } = useMarkRead(channelId);

  const [announcement, setAnnouncement] = useState("");
  const announcedRef = useRef<string | null>(null);

  const rows =
    enabled && messages.data !== undefined
      ? buildRows(flattenPages(messages.data.pages))
      : [];

  const firstItemIndexRef = useRef(FIRST_ITEM_BASE);
  const firstKeyRef = useRef<string | null>(null);

  firstItemIndexRef.current -= prependedCount(firstKeyRef.current, rows);
  firstKeyRef.current = rows[0]?.key ?? firstKeyRef.current;

  const newest = rows.at(-1);
  const newestId = newest?.kind === "message" ? newest.message.id : null;

  const jumpIndex = rows.findIndex(
    (row) => row.kind === "message" && row.message.id === jumpTo,
  );

  const mountAt =
    jumpIndex === -1
      ? (initialTopMostItemIndex ?? {
          align: "end" as const,
          index: "LAST" as const,
        })
      : jumpIndex;

  const dividerBeforeKey =
    dividerAfterMessageId === null
      ? null
      : (rows.find(
          (row) =>
            row.kind === "message" && row.message.id > dividerAfterMessageId,
        )?.key ?? null);
  const newestContent =
    newest?.kind === "message" ? newest.message.content : "";

  const loaded = messages.isSuccess;

  useEffect(() => {
    if (!loaded) {
      return;
    }

    if (announcedRef.current === null) {
      announcedRef.current = newestId ?? "";
      return;
    }

    if (newestId !== null && announcedRef.current !== newestId) {
      announcedRef.current = newestId;
      setAnnouncement(newestContent);
    }
  }, [loaded, newestContent, newestId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        aria-live="polite"
        className="sr-only"
        data-slot="message-announcer"
        role="status"
      >
        {announcement}
      </div>

      {!enabled ? (
        <p className="p-4 text-sm text-muted-foreground">
          Choose a channel to start reading.
        </p>
      ) : messages.isError ? (
        <p className="p-4 text-sm text-muted-foreground" role="alert">
          Could not load messages.
        </p>
      ) : (
        <Virtuoso
          atBottomStateChange={(atBottom) => {
            if (atBottom && newestId !== null) {
              markRead(newestId);
            }
          }}
          className="flex-1"
          data={rows}
          firstItemIndex={firstItemIndexRef.current}
          followOutput="auto"
          itemContent={(_index, row) =>
            row.kind === "date" ? (
              <DateDivider day={row.day} />
            ) : (
              <>
                {row.key === dividerBeforeKey ? <NewMessagesDivider /> : null}
                <div
                  className={
                    row.message.id === jumpTo
                      ? "bg-primary/10 ring-1 ring-primary/40"
                      : undefined
                  }
                  data-highlighted={row.message.id === jumpTo ? "" : undefined}
                >
                  <MessageRow
                    grouped={row.grouped}
                    message={row.message}
                    onDiscard={discard}
                    onRetry={(entry) => {
                      if (me !== undefined) {
                        retry(entry, me.id);
                      }
                    }}
                  />
                </div>
              </>
            )
          }
          ref={listRef}
          startReached={() => {
            if (messages.hasNextPage && !messages.isFetchingNextPage) {
              void messages.fetchNextPage();
            }
          }}
          initialTopMostItemIndex={mountAt}
        />
      )}

      {enabled ? (
        <>
          <TypingRow channelId={channelId} />
          <Composer channelId={channelId} />
        </>
      ) : null}
    </div>
  );
}
