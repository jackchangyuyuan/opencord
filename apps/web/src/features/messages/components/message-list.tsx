import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import { channelMessagesQuery } from "@/features/messages/api/queries";
import { Composer } from "@/features/messages/components/composer";
import { DateDivider } from "@/features/messages/components/date-divider";
import { MessageRow } from "@/features/messages/components/message-row";
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

  const messages = useInfiniteQuery({
    ...channelMessagesQuery(channelId ?? ""),
    enabled,
  });

  const { data: me } = useQuery(currentUserQuery);
  const { retry, discard } = useSendMessage(channelId ?? "");

  const rows =
    enabled && messages.data !== undefined
      ? buildRows(flattenPages(messages.data.pages))
      : [];

  const firstItemIndexRef = useRef(FIRST_ITEM_BASE);
  const firstKeyRef = useRef<string | null>(null);

  firstItemIndexRef.current -= prependedCount(firstKeyRef.current, rows);
  firstKeyRef.current = rows[0]?.key ?? firstKeyRef.current;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        aria-live="polite"
        className="sr-only"
        data-slot="message-announcer"
        role="status"
      />

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
          className="flex-1"
          data={rows}
          firstItemIndex={firstItemIndexRef.current}
          followOutput="auto"
          itemContent={(_index, row) =>
            row.kind === "date" ? (
              <DateDivider day={row.day} />
            ) : (
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
            )
          }
          ref={listRef}
          startReached={() => {
            if (messages.hasNextPage && !messages.isFetchingNextPage) {
              void messages.fetchNextPage();
            }
          }}
          {...(initialTopMostItemIndex === undefined
            ? {}
            : { initialTopMostItemIndex })}
        />
      )}

      {enabled ? <Composer channelId={channelId} /> : null}
    </div>
  );
}
