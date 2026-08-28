export interface SearchChip {
  key: "from" | "in" | "before" | "after";
  value: string;
  token: string;
}

const TOKEN = /"[^"]*"|\S+/g;
const KEYS = new Set(["from", "in", "before", "after"]);

function isChipKey(key: string): key is SearchChip["key"] {
  return KEYS.has(key);
}

export function chipsOf(raw: string): SearchChip[] {
  const chips: SearchChip[] = [];

  for (const token of raw.match(TOKEN) ?? []) {
    const separator = token.indexOf(":");

    if (separator <= 0) {
      continue;
    }

    const key = token.slice(0, separator).toLowerCase();
    const value = token.slice(separator + 1);

    if (isChipKey(key) && value !== "") {
      chips.push({ key, value: value.replace(/^[@#]/, ""), token });
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
