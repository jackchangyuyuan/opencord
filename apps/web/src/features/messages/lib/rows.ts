import type { Message } from "@opencord/shared/types";

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
}

export type Row = DateDividerRow | MessageRowItem;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

export function localDay(iso: string): string {
  const at = new Date(iso);

  return `${pad(at.getFullYear(), 4)}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
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
      previous?.authorId === message.authorId &&
      Date.parse(message.createdAt) - Date.parse(previous.createdAt) <
        GROUPING_WINDOW_MS;

    rows.push({ kind: "message", key: message.id, message, grouped });
    previous = message;
  }

  return rows;
}

export function prependedCount(
  previousFirstKey: string | null,
  rows: readonly Row[],
): number {
  if (previousFirstKey === null) {
    return 0;
  }

  const index = rows.findIndex((row) => row.key === previousFirstKey);

  return index <= 0 ? 0 : index;
}
