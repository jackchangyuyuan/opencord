import type { Message } from "@opencord/shared/types";

import { localDay } from "@/lib/local-day";

export const GROUPING_WINDOW_MS = 5 * 60 * 1000;

export interface DateDividerRow {
  kind: "date";
  key: string;
  day: string;
}

export interface MessageRowItem {
  kind: "message";
  key: string;
  message: Message;
  grouped: boolean;
  firstOfDay: boolean;
}

export type Row = DateDividerRow | MessageRowItem;

export function rowKey(message: Message): string {
  return message.nonce === null
    ? message.id
    : `nonce:${message.authorId}:${message.nonce}`;
}

export function flattenPages(pages: readonly { data: Message[] }[]): Message[] {
  return pages.flatMap((page) => page.data).reverse();
}

export function buildRows(messages: readonly Message[]): Row[] {
  const rows: Row[] = [];
  let previous: Message | undefined;

  for (const message of messages) {
    const newDay =
      previous === undefined ||
      localDay(previous.createdAt) !== localDay(message.createdAt);

    if (newDay) {
      rows.push({
        kind: "date",
        key: `date-${localDay(message.createdAt)}`,
        day: localDay(message.createdAt),
      });
    }

    const grouped =
      !newDay &&
      message.replyTo === null &&
      previous?.authorId === message.authorId &&
      Date.parse(message.createdAt) - Date.parse(previous.createdAt) <
        GROUPING_WINDOW_MS;

    rows.push({
      kind: "message",
      key: rowKey(message),
      message,
      grouped,
      firstOfDay: newDay,
    });
    previous = message;
  }

  return rows;
}

export function unreadBoundaryKey(
  rows: readonly Row[],
  afterMessageId: string | null,
  historyComplete: boolean,
): string | null {
  if (afterMessageId === null) {
    return null;
  }

  const readSideLoaded =
    historyComplete ||
    rows.some(
      (row) => row.kind === "message" && row.message.id <= afterMessageId,
    );

  if (!readSideLoaded) {
    return null;
  }

  return (
    rows.find(
      (row) => row.kind === "message" && row.message.id > afterMessageId,
    )?.key ?? null
  );
}

export interface ListAnchor {
  key: string;
  index: number;
}

export function listAnchor(rows: readonly Row[]): ListAnchor | null {
  const index = rows.findIndex((row) => row.kind === "message");
  const row = rows[index];

  return row === undefined ? null : { key: row.key, index };
}

export function prependedCount(
  previous: ListAnchor | null,
  rows: readonly Row[],
): number {
  if (previous === null) {
    return 0;
  }

  const index = rows.findIndex(
    (row) => row.kind === "message" && row.key === previous.key,
  );

  return index <= previous.index ? 0 : index - previous.index;
}
