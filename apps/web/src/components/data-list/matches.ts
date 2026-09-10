export function matches(
  term: string,
  ...fields: (string | null | undefined)[]
): boolean {
  const needle = term.trim().toLowerCase();

  if (needle === "") {
    return true;
  }

  return fields.some(
    (field) =>
      typeof field === "string" && field.toLowerCase().includes(needle),
  );
}

export function withinDays(
  iso: string,
  from: string | null,
  to: string | null,
): boolean {
  const day = iso.slice(0, 10);

  if (from !== null && day < from) {
    return false;
  }

  return !(to !== null && day > to);
}
