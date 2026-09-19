import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Hash, MessageSquarePlus, TriangleAlert } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import { EmptyState } from "@/components/layout/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { channelQuery } from "@/features/channels/api/queries";
import { channelMessagesQuery } from "@/features/messages/api/queries";
import { ChatAlerts } from "@/features/messages/components/chat-alerts";
import { Composer } from "@/features/messages/components/composer";
import { DateDivider } from "@/features/messages/components/date-divider";
import { JumpToPresent } from "@/features/messages/components/jump-to-present";
import { MessageRow } from "@/features/messages/components/message-row";
import { NewMessagesDivider } from "@/features/messages/components/new-messages-divider";
import { TypingRow } from "@/features/messages/components/typing-row";
import {
  EVERYTHING_UNREAD,
  useMarkRead,
} from "@/features/messages/hooks/use-mark-read";
import { useMessageActions } from "@/features/messages/hooks/use-message-actions";
import { isOptimistic } from "@/features/messages/lib/cache";
import { revealDelta } from "@/features/messages/lib/reply-jump";
import {
  MESSAGE_ROW,
  moveRovingFocus,
} from "@/features/messages/lib/roving-focus";
import {
  buildRows,
  flattenPages,
  type ListAnchor,
  listAnchor,
  prependedCount,
  type Row,
  unreadBoundaryKey,
} from "@/features/messages/lib/rows";
import {
  atBottom as scrollerAtBottom,
  farFromBottom,
  holdRow,
  itemColumn,
  nearBottom,
  OPENING_FRAMES,
  settle,
  toBottom,
  watchReaderScroll,
} from "@/features/messages/lib/scroll-settle";
import { serversQuery } from "@/features/servers/api/queries";
import { currentUserQuery } from "@/features/users/api/queries";
import { cn } from "@/lib/cn";

const FIRST_ITEM_BASE = 1_000_000;

const FLASH_MS = 2200;

const OVERSCAN = { top: 1600, bottom: 800 };

const ROW_HEIGHT_ESTIMATE = 78;

const SKELETON = [
  "62%",
  "48%",
  "71%",
  "38%",
  "80%",
  "55%",
  "66%",
  "44%",
  "74%",
  "58%",
  "35%",
  "69%",
  "51%",
  "77%",
  "41%",
  "64%",
  "56%",
  "72%",
];

const SKELETON_DELAY =
  "animate-in fade-in opacity-0 duration-150 fill-mode-forwards [animation-delay:300ms]";

function EmptyChannel() {
  return (
    <EmptyState
      className="h-full"
      description="Nothing has been said here yet. The first message is yours."
      icon={<MessageSquarePlus aria-hidden className="size-6" />}
      title="This channel is empty"
    />
  );
}

const EMPTY_PLACEHOLDER = { EmptyPlaceholder: EmptyChannel };

type Arrival = "bottom" | "unread" | "jump";

function newestSettled(rows: readonly Row[]): string | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];

    if (row?.kind === "message" && !isOptimistic(row.message.id)) {
      return row.message.id;
    }
  }

  return null;
}

const ROW_WITH_KEY = "[data-row-key]";

function visibleAnchor(scroller: HTMLElement): HTMLElement | null {
  const top = scroller.getBoundingClientRect().top;

  return (
    [...scroller.querySelectorAll<HTMLElement>(ROW_WITH_KEY)].find(
      (row) => row.getBoundingClientRect().bottom > top,
    ) ?? null
  );
}

function PendingMessages({
  className,
  delayed = false,
}: {
  className?: string;
  delayed?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex flex-1 flex-col justify-end gap-5 overflow-hidden p-5",
        className,
      )}
    >
      {SKELETON.map((width, index) => (
        <div
          className={cn("flex shrink-0 gap-4", delayed && SKELETON_DELAY)}
          key={width}
        >
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2.5 pt-1">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3" style={{ width }} />
            {index % 3 === 0 ? <Skeleton className="h-3 w-1/3" /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessageList({
  channelId,
  initialTopMostItemIndex,
  onDrawn,
  prepared = false,
}: {
  channelId: string | undefined;
  initialTopMostItemIndex?: number;
  onDrawn?: () => void;
  prepared?: boolean;
}) {
  const listRef = useRef<VirtuosoHandle>(null);
  const enabled = channelId !== undefined;

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const jumpTo = searchParams.get("around");

  const messages = useInfiniteQuery({
    ...channelMessagesQuery(channelId ?? "", jumpTo),
    enabled,
  });

  const { data: me } = useQuery(currentUserQuery);
  const myId = me?.id;
  const { data: servers } = useQuery(serversQuery);
  const noServers = servers?.length === 0;
  const { data: channel } = useQuery({
    ...channelQuery(channelId ?? ""),
    enabled,
  });
  const { boundaryKnown, dividerAfterMessageId, markRead } = useMarkRead(
    channelId,
    channel?.serverId,
  );
  const actions = useMessageActions(channelId);

  const [painted, setPainted] = useState(false);
  const openedRef = useRef(false);
  const openRafRef = useRef(0);
  const releaseRef = useRef<(() => void) | null>(null);
  const mountRowKeyRef = useRef<string | null>(null);
  const reachedRef = useRef(false);
  const [announcement, setAnnouncement] = useState("");

  const announcedRef = useRef<string | null>(null);
  const rovingRef = useRef<HTMLDivElement>(null);

  const onRovingKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const container = rovingRef.current;

    if (
      container !== null &&
      moveRovingFocus(
        container,
        event.key,
        document.activeElement as HTMLElement | null,
      )
    ) {
      event.preventDefault();
    }
  };

  const rows = useMemo(
    () =>
      enabled && messages.data !== undefined
        ? buildRows(flattenPages(messages.data.pages))
        : [],
    [enabled, messages.data],
  );

  const rowsRef = useRef(rows);

  rowsRef.current = rows;

  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimerRef = useRef(0);
  const holdJumpRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      window.clearTimeout(flashTimerRef.current);
      holdJumpRef.current?.();
    },
    [],
  );

  const jumpToMessage = useCallback(
    (messageId: string) => {
      const rows = rowsRef.current;
      const index = rows.findIndex(
        (row) => row.kind === "message" && row.message.id === messageId,
      );
      const scroller = scrollerRef.current;

      if (index === -1 || scroller === null) {
        void navigate(
          `/app/channels/${channelId ?? ""}?around=${encodeURIComponent(messageId)}`,
        );

        return;
      }

      const key = rows[index]?.key ?? "";
      const rowOf = () =>
        scroller.querySelector<HTMLElement>(
          `[data-row-key="${CSS.escape(key)}"]`,
        );

      const geometryOf = (row: HTMLElement) => {
        const item = row.getBoundingClientRect();
        const view = scroller.getBoundingClientRect();

        return {
          itemBottom: item.bottom,
          itemTop: item.top,
          viewportBottom: view.bottom,
          viewportTop: view.top,
        };
      };

      const takeTheList = () => {
        reachedRef.current = true;
        followingRef.current = false;
        setFollowing(false);
      };

      holdJumpRef.current?.();
      holdJumpRef.current = null;

      setFlashId(messageId);
      window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => {
        setFlashId(null);
      }, FLASH_MS);

      const mounted = rowOf();

      if (mounted !== null) {
        const top = mounted.getBoundingClientRect().top;
        const delta = revealDelta(geometryOf(mounted));

        if (delta === 0) {
          return;
        }

        takeTheList();
        scroller.scrollTop += delta;
        holdJumpRef.current = holdRow(scroller, rowOf, top - delta);

        return;
      }

      takeTheList();
      listRef.current?.scrollToIndex({
        align: "center",
        behavior: "auto",
        index,
      });

      let placed: (() => void) | null = null;

      const stopWaiting = settle(
        scroller,
        () => {
          const again = rowOf();

          if (again === null || placed !== null) {
            return;
          }

          const top = again.getBoundingClientRect().top;
          const delta = revealDelta(geometryOf(again));

          scroller.scrollTop += delta;
          placed = holdRow(scroller, rowOf, top - delta, OPENING_FRAMES);
        },
        OPENING_FRAMES,
      );

      holdJumpRef.current = () => {
        stopWaiting();
        placed?.();
      };
    },
    [channelId, navigate],
  );

  const firstItemIndexRef = useRef(FIRST_ITEM_BASE);
  const anchorRef = useRef<ListAnchor | null>(null);

  const scrollerRef = useRef<HTMLElement | null>(null);
  const holdRef = useRef<{ key: string; top: number } | null>(null);
  const [following, setFollowing] = useState(jumpTo === null);
  const followingRef = useRef(following);
  const caughtUpToRef = useRef<string | null>(null);
  const newestSettledIdRef = useRef<string | null>(null);

  const setFollow = (next: boolean) => {
    followingRef.current = next;
    setFollowing(next);
  };

  const takeThePresent = useCallback(() => {
    setFollow(true);
    caughtUpToRef.current = newestSettledIdRef.current;
    reachedRef.current = false;
  }, []);

  const goToBottom = useCallback(() => {
    const scroller = scrollerRef.current;

    takeThePresent();

    if (scroller !== null) {
      settle(scroller, toBottom, OPENING_FRAMES);
    }
  }, [takeThePresent]);

  const prepended = prependedCount(anchorRef.current, rows);

  if (prepended > 0 && scrollerRef.current !== null) {
    const held = visibleAnchor(scrollerRef.current);

    holdRef.current =
      held === null
        ? null
        : {
            key: held.dataset["rowKey"] ?? "",
            top: held.getBoundingClientRect().top,
          };
  }

  firstItemIndexRef.current -= prepended;
  anchorRef.current = listAnchor(rows) ?? anchorRef.current;

  const newest = rows.at(-1);
  const newestId = newest?.kind === "message" ? newest.message.id : null;

  const newestSettledId = newestSettled(rows);

  newestSettledIdRef.current = newestSettledId;

  if (followingRef.current) {
    caughtUpToRef.current = newestSettledId;
  }

  const caughtUpTo = caughtUpToRef.current;

  const behind =
    caughtUpTo === null
      ? 0
      : rows.filter(
          (row) =>
            row.kind === "message" &&
            !isOptimistic(row.message.id) &&
            row.message.id > caughtUpTo,
        ).length;

  const jumpIndex = rows.findIndex(
    (row) => row.kind === "message" && row.message.id === jumpTo,
  );

  const dividerBeforeKey = unreadBoundaryKey(
    rows,
    dividerAfterMessageId,
    !messages.hasNextPage,
  );

  const firstUnreadIndex =
    dividerBeforeKey === null
      ? -1
      : rows.findIndex((row) => row.key === dividerBeforeKey);

  const openAtUnread =
    dividerAfterMessageId !== EVERYTHING_UNREAD && firstUnreadIndex > 0;

  const arrivalRef = useRef<Arrival | null>(null);

  if (arrivalRef.current === null && rows.length > 0 && boundaryKnown) {
    arrivalRef.current =
      jumpTo !== null ? "jump" : openAtUnread ? "unread" : "bottom";

    if (arrivalRef.current !== "bottom") {
      followingRef.current = false;
      caughtUpToRef.current =
        arrivalRef.current === "unread" ? dividerAfterMessageId : jumpTo;
    }
  }

  const arrival = arrivalRef.current;

  const onOwnSend = useCallback(() => {
    arrivalRef.current = "bottom";
    ownSendRef.current = true;
    takeThePresent();
  }, [takeThePresent]);

  const boundaryMount = openAtUnread ? firstUnreadIndex : -1;

  mountRowKeyRef.current =
    boundaryMount === -1 ? null : (rows[boundaryMount]?.key ?? null);

  // Mount where the reader belongs rather than scrolling there after measuring:
  // rows are measured only once they paint. The unread arrival mounts on the
  // boundary row itself, which the marker is drawn at the top of -- so the
  // conversation opens on the line, with everything already read above the fold.
  const mountAt =
    jumpIndex !== -1
      ? jumpIndex
      : openAtUnread
        ? { align: "start" as const, index: boundaryMount }
        : (initialTopMostItemIndex ?? {
            align: "end" as const,
            index: "LAST" as const,
          });

  const newestContent =
    newest?.kind === "message" ? newest.message.content : "";

  const loaded = messages.isSuccess;

  useLayoutEffect(() => {
    if (arrival !== null && arrival !== "bottom") {
      setFollowing(false);
    }
  }, [arrival]);

  useLayoutEffect(() => {
    const held = holdRef.current;
    const scroller = scrollerRef.current;

    holdRef.current = null;

    if (held === null || scroller === null) {
      return;
    }

    return settle(scroller, () => {
      const again = scroller.querySelector<HTMLElement>(
        `[data-row-key="${CSS.escape(held.key)}"]`,
      );

      if (again === null) {
        return;
      }

      const drift = again.getBoundingClientRect().top - held.top;

      if (Math.abs(drift) > 0.5) {
        scroller.scrollTop += drift;
      }
    });
  });

  const openList = (scroller: HTMLElement) => {
    let blank = OPENING_FRAMES;
    let frames = OPENING_FRAMES;
    let measured = -1;
    let revealed = false;

    const stopWatching = watchReaderScroll(scroller, () => {
      reachedRef.current = true;
    });

    const mountKey = mountRowKeyRef.current;

    const stopPinning =
      arrivalRef.current === "unread" && mountKey !== null
        ? holdRow(
            scroller,
            () =>
              scroller.querySelector<HTMLElement>(
                `[data-row-key="${CSS.escape(mountKey)}"]`,
              ),
            scroller.getBoundingClientRect().top,
          )
        : null;

    releaseRef.current = () => {
      stopWatching();
      stopPinning?.();
    };

    const tick = () => {
      const drawn = rovingRef.current?.querySelector(MESSAGE_ROW) != null;
      const toTheBottom = arrivalRef.current === "bottom";

      if (drawn) {
        frames -= 1;
      } else {
        blank -= 1;
      }

      const height = scroller.scrollHeight;
      const stable = height === measured;

      measured = height;

      const settled = scrollerAtBottom(scroller);

      if (drawn && toTheBottom && !reachedRef.current && !settled) {
        toBottom(scroller);
      }

      if (
        !revealed &&
        drawn &&
        stable &&
        (!toTheBottom || reachedRef.current || settled)
      ) {
        revealed = true;
        setPainted(true);
      }

      if (frames <= 0 || blank <= 0) {
        if (!revealed) {
          revealed = true;
          setPainted(true);
        }

        return;
      }

      openRafRef.current = requestAnimationFrame(tick);
    };

    tick();
  };

  useEffect(
    () => () => {
      cancelAnimationFrame(openRafRef.current);
      releaseRef.current?.();
    },
    [],
  );

  const keepBottomRef = useRef<(mine?: boolean) => void>(() => undefined);
  const ownSendRef = useRef(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const content = scroller === null ? null : itemColumn(scroller);

    if (scroller === null || content === null) {
      return;
    }

    let stop: () => void = () => undefined;

    const keep = (mine = false) => {
      if (
        !mine &&
        (reachedRef.current || !followingRef.current || !nearBottom(scroller))
      ) {
        return;
      }

      stop();
      stop = settle(scroller, (element) => {
        if (mine || nearBottom(element)) {
          toBottom(element);
        }
      });
    };

    keepBottomRef.current = keep;

    const observer = new ResizeObserver(() => {
      keep();
    });

    observer.observe(content);
    observer.observe(scroller);

    return () => {
      stop();
      observer.disconnect();
      keepBottomRef.current = () => undefined;
    };
  }, [painted]);

  useLayoutEffect(() => {
    const mine = ownSendRef.current;

    ownSendRef.current = false;
    keepBottomRef.current(mine);
  }, [newestId]);

  const drawn = !enabled || messages.isError || rows.length === 0 || painted;

  const drawnRef = useRef(false);

  useLayoutEffect(() => {
    if (drawn && !drawnRef.current) {
      drawnRef.current = true;
      onDrawn?.();
    }
  }, [drawn, onDrawn]);

  const preparedRef = useRef(prepared);

  useEffect(() => {
    const was = preparedRef.current;

    preparedRef.current = prepared;

    const scroller = scrollerRef.current;

    if (
      !was ||
      prepared ||
      scroller === null ||
      !scrollerAtBottom(scroller) ||
      newestSettledIdRef.current === null
    ) {
      return;
    }

    markRead(newestSettledIdRef.current);
  }, [markRead, prepared]);

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

      <div className="relative flex min-h-0 flex-1 flex-col">
        {!enabled ? (
          <EmptyState
            className="flex-1"
            description={
              noServers
                ? "Create a server from the sidebar, or open an invite link somebody sent you."
                : "Pick one from the sidebar and its history opens here."
            }
            icon={<Hash aria-hidden className="size-6" />}
            title={
              noServers
                ? "Nothing to read yet"
                : "Choose a channel to start reading"
            }
          />
        ) : messages.isError ? (
          <EmptyState
            className="flex-1"
            description="The channel is still there. This was the request, not the data."
            icon={<TriangleAlert aria-hidden className="size-6" />}
            title="Could not load messages"
            action={
              <Button
                onClick={() => void messages.refetch()}
                size="sm"
                variant="outline"
              >
                Try again
              </Button>
            }
          />
        ) : messages.isPending || !boundaryKnown ? (
          <PendingMessages />
        ) : (
          <div
            className="relative flex min-h-0 flex-1 flex-col"
            onKeyDown={onRovingKeyDown}
            ref={rovingRef}
          >
            <Virtuoso
              itemsRendered={(items) => {
                const scroller = scrollerRef.current;

                if (
                  items.length === 0 ||
                  openedRef.current ||
                  scroller === null
                ) {
                  return;
                }

                openedRef.current = true;
                openList(scroller);
              }}
              aria-label="Message history"
              atBottomStateChange={(atBottom) => {
                const scroller = scrollerRef.current;

                if (atBottom) {
                  reachedRef.current = false;
                  setFollow(true);
                } else if (
                  reachedRef.current ||
                  (scroller !== null && farFromBottom(scroller))
                ) {
                  setFollow(false);
                }

                if (atBottom && newestId !== null && !prepared) {
                  markRead(newestId);
                }
              }}
              className="flex-1 focus-visible:outline-2! focus-visible:outline-offset-[-2px]! focus-visible:outline-ring!"
              computeItemKey={(_index, row) => row.key}
              scrollerRef={(ref) => {
                scrollerRef.current = ref as HTMLElement | null;
              }}
              data={rows}
              firstItemIndex={firstItemIndexRef.current}
              followOutput={false}
              itemContent={(_index, row) =>
                row.kind === "date" ? (
                  <div data-row-key={row.key}>
                    <DateDivider day={row.day} />
                  </div>
                ) : (
                  <div data-row-key={row.key}>
                    {row.key === dividerBeforeKey ? (
                      <NewMessagesDivider />
                    ) : null}
                    <MessageRow
                      grouped={row.grouped}
                      highlighted={
                        row.message.id === jumpTo || row.message.id === flashId
                      }
                      onJumpToMessage={jumpToMessage}
                      separated={
                        !row.grouped &&
                        !row.firstOfDay &&
                        row.key !== dividerBeforeKey
                      }
                      message={row.message}
                      serverId={channel?.serverId ?? undefined}
                      onDiscard={actions.onDiscard}
                      onRetry={actions.onRetry}
                      onReply={actions.onReply}
                      {...(actions.mayReact
                        ? { onToggleReaction: actions.onToggleReaction }
                        : {})}
                      editing={row.message.id === actions.editingId}
                      onCancelEdit={actions.onCancelEdit}
                      onSaveEdit={actions.onSaveEdit}
                      {...(row.message.authorId === myId
                        ? { onEdit: actions.onEdit }
                        : {})}
                      {...(actions.mayDelete(row.message.authorId)
                        ? { onDelete: actions.onDelete }
                        : {})}
                      {...(actions.mayManageMessages
                        ? { onTogglePin: actions.onTogglePin }
                        : {})}
                    />
                  </div>
                )
              }
              defaultItemHeight={ROW_HEIGHT_ESTIMATE}
              increaseViewportBy={OVERSCAN}
              components={EMPTY_PLACEHOLDER}
              ref={listRef}
              role="group"
              startReached={() => {
                if (
                  painted &&
                  messages.hasNextPage &&
                  !messages.isFetchingNextPage
                ) {
                  void messages.fetchNextPage();
                }
              }}
              initialTopMostItemIndex={mountAt}
            />
            {painted || rows.length === 0 ? null : (
              <PendingMessages
                className="absolute inset-0 z-10 bg-background"
                delayed
              />
            )}
          </div>
        )}

        {/* Only over a conversation that is actually on screen. The count is
            derived from the rows and the watermark, both of which are true
            several frames before the list has finished positioning itself --
            so on a channel that opens at an unread boundary, `behind` was
            already forty-odd while the region was still showing its
            placeholder, and the pill was drawn over the skeleton offering to
            jump to the present of a conversation that had not appeared yet.
            Measured on a server hop, it stood there for 213ms; on a DM, 27ms
            before the list settled at the bottom and the count fell back to
            zero -- a flash of "new messages" that was never about anything the
            reader had missed.

            `painted` is the same answer the placeholder itself is drawn from,
            so the two cannot disagree: while the region is unresolved there is
            no pill, and the frame the conversation is revealed on is the frame
            the pill starts deriving from real geometry. */}
        {painted ? <JumpToPresent count={behind} onJump={goToBottom} /> : null}

        <ChatAlerts />
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            actions.closeConfirm();
          }
        }}
        open={actions.confirming !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              It is replaced by &ldquo;This message was deleted.&rdquo; for
              everyone in the channel, and cannot be brought back.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={actions.confirmDelete}
              variant="destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {enabled ? (
        <>
          <TypingRow channelId={channelId} />
          <Composer channelId={channelId} onSend={onOwnSend} />
        </>
      ) : null}
    </div>
  );
}
