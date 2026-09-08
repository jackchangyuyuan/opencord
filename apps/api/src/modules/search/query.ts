export interface SearchFilters {
  from: string[];
  in: string[];
  before: string | null;
  after: string | null;
  on: string | null;
}

export interface ParsedSearchQuery {
  text: string;
  filters: SearchFilters;
  hasFilters: boolean;
}

const TOKEN = /"[^"]*"|\S+/g;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(value: string): boolean {
  if (!DATE.test(value)) {
    return false;
  }

  const at = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(at.getTime()) && at.toISOString().startsWith(`${value}T`)
  );
}

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const filters: SearchFilters = {
    from: [],
    in: [],
    before: null,
    after: null,
    on: null,
  };
  const rest: string[] = [];

  for (const token of raw.match(TOKEN) ?? []) {
    const separator = token.indexOf(":");
    const key = separator === -1 ? "" : token.slice(0, separator).toLowerCase();
    const value = token.slice(separator + 1);

    if (key === "from" && value !== "") {
      filters.from.push(value.replace(/^@/, ""));
      continue;
    }

    if (key === "in" && value !== "") {
      filters.in.push(value.replace(/^#/, ""));
      continue;
    }

    if (key === "before" && isDate(value)) {
      filters.before = value;
      continue;
    }

    if (key === "after" && isDate(value)) {
      filters.after = value;
      continue;
    }

    if (key === "on" && isDate(value)) {
      filters.on = value;
      continue;
    }

    rest.push(token);
  }

  return {
    text: rest.join(" ").trim(),
    filters,
    hasFilters:
      filters.from.length > 0 ||
      filters.in.length > 0 ||
      filters.before !== null ||
      filters.after !== null ||
      filters.on !== null,
  };
}
