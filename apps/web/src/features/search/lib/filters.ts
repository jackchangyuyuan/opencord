import {
  type FilterKey,
  isDate,
  isDateKey,
  isFilterKey,
} from "@/features/search/lib/query-token";

export interface SearchChip {
  key: FilterKey;
  value: string;
  token: string;
}

const TOKEN = /"[^"]*"|\S+/g;

function chipValue(key: string, value: string): string | null {
  if (!isFilterKey(key) || value === "") {
    return null;
  }

  const bare = value.replace(/^[@#]/, "");

  return isDateKey(key) && !isDate(bare) ? null : bare;
}

export function chipsOf(raw: string): SearchChip[] {
  const chips: SearchChip[] = [];

  for (const token of raw.match(TOKEN) ?? []) {
    const separator = token.indexOf(":");

    if (separator <= 0) {
      continue;
    }

    const key = token.slice(0, separator).toLowerCase();
    const value = chipValue(key, token.slice(separator + 1));

    if (isFilterKey(key) && value !== null) {
      chips.push({ key, value, token });
    }
  }

  return chips;
}

export function withoutChip(raw: string, chip: SearchChip): string {
  return (raw.match(TOKEN) ?? [])
    .filter((token) => token !== chip.token)
    .join(" ")
    .trim();
}
