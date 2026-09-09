export interface Identity {
  id: string;
  username: string;
  name: string;
}

export function toHandle(username: string): string {
  return `@${username}`;
}

export function isHandleTerm(term: string): boolean {
  return term.trimStart().startsWith("@");
}

export function bareTerm(term: string): string {
  const trimmed = term.trim();

  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
}

function contains(field: string | null | undefined, needle: string): boolean {
  return typeof field === "string" && field.toLowerCase().includes(needle);
}

export function matchesIdentity(
  term: string,
  identity: Pick<Identity, "username" | "name"> & { nickname?: string | null },
): boolean {
  const needle = bareTerm(term).toLowerCase();

  if (needle === "") {
    return true;
  }

  if (isHandleTerm(term)) {
    return contains(identity.username, needle);
  }

  return (
    contains(identity.username, needle) ||
    contains(identity.name, needle) ||
    contains(identity.nickname, needle)
  );
}

const SUGGESTION_LIMIT = 6;

export function rankSuggestions<T extends Pick<Identity, "username" | "name">>(
  term: string,
  candidates: readonly T[],
): T[] {
  const needle = bareTerm(term).toLowerCase();

  const matched = candidates.filter(
    (candidate) =>
      needle === "" ||
      contains(candidate.username, needle) ||
      contains(candidate.name, needle),
  );

  return matched
    .map((candidate) => ({
      candidate,
      rank: candidate.username.toLowerCase().startsWith(needle) ? 0 : 1,
    }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.candidate.username.localeCompare(b.candidate.username),
    )
    .slice(0, SUGGESTION_LIMIT)
    .map((entry) => entry.candidate);
}
