import { Permissions } from "@opencord/shared/permissions";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import { EmptyState } from "@/components/layout/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { channelMessagesQuery } from "@/features/messages/api/queries";
import { Composer } from "@/features/messages/components/composer";
import { DateDivider } from "@/features/messages/components/date-divider";
import { MessageRow } from "@/features/messages/components/message-row";
import { NewMessagesDivider } from "@/features/messages/components/new-messages-divider";
import { TypingRow } from "@/features/messages/components/typing-row";
import { useMarkRead } from "@/features/messages/hooks/use-mark-read";
import {
  type ChatMessage,
  useSendMessage,
} from "@/features/messages/hooks/use-send-message";
import { useTogglePin } from "@/features/messages/hooks/use-toggle-pin";
import { useToggleReaction } from "@/features/messages/hooks/use-toggle-reaction";
import {
  buildRows,
  flattenPages,
  prependedCount,
} from "@/features/messages/lib/rows";
import {
  has,
  useChannelPermissions,
} from "@/features/permissions/hooks/use-permissions";
import { currentUserQuery } from "@/features/users/api/queries";
import { useUi } from "@/stores/ui";

const FIRST_ITEM_BASE = 1_000_000;

const ROW = "[data-message-row]";
const CONTROL = "button:not([disabled]), a[href]";

function elements(root: HTMLElement | null, selector: string): HTMLElement[] {
  return [...(root?.querySelectorAll<HTMLElement>(selector) ?? [])];
}

function step(items: HTMLElement[], from: HTMLElement | null, by: number) {
  if (items.length === 0) {
    return undefined;
  }

  const index = items.findIndex((item) => item === from || item.contains(from));

  if (index === -1) {
    return by > 0 ? items[0] : items[items.length - 1];
  }

  return items[Math.min(Math.max(index + by, 0), items.length - 1)];
}

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
  const { toggle: toggleReaction, error: reactionError } = useToggleReaction(
    channelId ?? "",
  );
  const setReplyTarget = useUi((state) => state.setReplyTarget);
  const { togglePin, error: pinError } = useTogglePin(channelId ?? "");
  const mayManageMessages = has(
    useChannelPermissions(channelId),
    Permissions.MANAGE_MESSAGES,
  );

  const mayReact = has(
    useChannelPermissions(channelId),
    Permissions.ADD_REACTIONS,
  );

  const [announcement, setAnnouncement] = useState("");
  const announcedRef = useRef<string | null>(null);
  const rovingRef = useRef<HTMLDivElement>(null);

  const onRovingKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const container = rovingRef.current;
    const active = document.activeElement as HTMLElement | null;

    if (container === null) {
      return;
    }

    const rowList = elements(container, ROW);
    const row = rowList.find(
      (entry) => entry === active || entry.contains(active),
    );

    const vertical =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;

    if (vertical !== 0) {
      const next =
        active === container
          ? rowList[rowList.length - 1]
          : step(rowList, active, vertical);

      next?.focus();
      event.preventDefault();
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      const edge =
        event.key === "Home" ? rowList[0] : rowList[rowList.length - 1];

      edge?.focus();
      event.preventDefault();
      return;
    }

    if (row === undefined) {
      return;
    }

    const controls = elements(row, CONTROL);
    const horizontal =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;

    if (horizontal !== 0 && controls.length > 0) {
      (active === row
        ? horizontal > 0
          ? controls[0]
          : controls[controls.length - 1]
        : step(controls, active, horizontal)
      )?.focus();
      event.preventDefault();
      return;
    }

    if (event.key === "Escape" && active !== row) {
      row.focus();
      event.preventDefault();
    }
  };

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
        <EmptyState
          className="flex-1"
          description="Pick one from the sidebar and its history opens here."
          title="Choose a channel to start reading"
        />
      ) : messages.isError ? (
        <p className="p-4 text-sm text-muted-foreground" role="alert">
          Could not load messages.
        </p>
      ) : messages.isPending ? (
        <div aria-hidden className="flex flex-1 flex-col gap-3 p-4">
          {["a", "b", "c", "d", "e", "f"].map((key) => (
            <div className="flex gap-3" key={key}>
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          className="flex-1"
          description="Say the first thing in here."
          title="No messages yet"
        />
      ) : (
        <div
          className="flex min-h-0 flex-1 flex-col"
          onKeyDown={onRovingKeyDown}
          ref={rovingRef}
        >
          <Virtuoso
            aria-label="Message history"
            atBottomStateChange={(atBottom) => {
              if (atBottom && newestId !== null) {
                markRead(newestId);
              }
            }}
            className="flex-1 focus-visible:outline-2! focus-visible:outline-offset-[-2px]! focus-visible:outline-ring!"
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
                    data-highlighted={
                      row.message.id === jumpTo ? "" : undefined
                    }
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
                      onReply={(entry) => {
                        setReplyTarget({
                          channelId: entry.channelId,
                          messageId: entry.id,
                          authorId: entry.authorId,
                          content: entry.content,
                        });
                      }}
                      {...(mayReact
                        ? {
                            onToggleReaction: (
                              messageId: string,
                              emoji: string,
                              add: boolean,
                            ) => {
                              toggleReaction({ messageId, emoji, add });
                            },
                          }
                        : {})}
                      {...(mayManageMessages
                        ? {
                            onTogglePin: (entry: ChatMessage) => {
                              togglePin({
                                messageId: entry.id,
                                pin: entry.pinnedAt === null,
                              });
                            },
                          }
                        : {})}
                    />
                  </div>
                </>
              )
            }
            ref={listRef}
            role="group"
            startReached={() => {
              if (messages.hasNextPage && !messages.isFetchingNextPage) {
                void messages.fetchNextPage();
              }
            }}
            initialTopMostItemIndex={mountAt}
          />
        </div>
      )}

      {reactionError === null ? null : (
        <p className="px-4 py-1 text-xs text-destructive" role="alert">
          {reactionError}
        </p>
      )}

      {pinError === null ? null : (
        <p className="px-4 py-1 text-xs text-destructive" role="alert">
          {pinError}
        </p>
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
