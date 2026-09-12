export const FILTER_KEYS = ["from", "in", "on", "before", "after"] as const;

export type FilterKey = (typeof FILTER_KEYS)[number];

export function isFilterKey(value: string): value is FilterKey {
  return (FILTER_KEYS as readonly string[]).includes(value);
}

export const DATE_KEYS = ["on", "before", "after"] as const;

export type DateKey = (typeof DATE_KEYS)[number];

export function isDateKey(key: string): key is DateKey {
  return (DATE_KEYS as readonly string[]).includes(key);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(value: string): boolean {
  if (!DATE.test(value)) {
    return false;
  }

  const at = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(at.getTime()) && at.toISOString().startsWith(`${value}T`)
  );
}

export interface QueryToken {
  start: number;
  end: number;
  text: string;
  key: FilterKey | null;
  value: string;
}

export function tokenAt(raw: string, caret: number): QueryToken {
  const clamped = Math.max(0, Math.min(caret, raw.length));

  let start = clamped;
  while (start > 0 && !/\s/.test(raw[start - 1] ?? "")) {
    start -= 1;
  }

  let end = clamped;
  while (end < raw.length && !/\s/.test(raw[end] ?? "")) {
    end += 1;
  }

  const text = raw.slice(start, end);
  const separator = text.indexOf(":");
  const rawKey = separator === -1 ? "" : text.slice(0, separator).toLowerCase();
  const key = isFilterKey(rawKey) ? rawKey : null;

  return {
    start,
    end,
    text,
    key,
    value: key === null ? text : text.slice(separator + 1).replace(/^[@#]/, ""),
  };
}

export interface Replacement {
  value: string;
  caret: number;
}

export function replaceToken(
  raw: string,
  token: QueryToken,
  replacement: string,
  { trailingSpace = true }: { trailingSpace?: boolean } = {},
): Replacement {
  const before = raw.slice(0, token.start);
  const after = raw.slice(token.end).replace(/^\s+/, "");

  const separator = after === "" ? (trailingSpace ? " " : "") : " ";

  return {
    value: `${before}${replacement}${separator}${after}`,
    caret:
      before.length +
      replacement.length +
      (trailingSpace ? separator.length : 0),
  };
}

export function alreadyFiltered(
  raw: string,
  key: FilterKey,
  value: string,
): boolean {
  const wanted = `${key}:${value.toLowerCase()}`;

  return (raw.match(/\S+/g) ?? []).some(
    (token) => token.toLowerCase().replace(/[@#]/g, "") === wanted,
  );
}

export function hasFilterKey(raw: string, key: FilterKey): boolean {
  return (raw.match(/\S+/g) ?? []).some((token) =>
    token.toLowerCase().startsWith(`${key}:`),
  );
}
