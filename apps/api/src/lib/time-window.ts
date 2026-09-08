function offsetAt(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return (
    Date.UTC(
      read("year"),
      read("month") - 1,
      read("day"),
      read("hour") % 24,
      read("minute"),
      read("second"),
    ) - at.getTime()
  );
}

export function knownTimeZone(timeZone: string | undefined): string {
  if (timeZone === undefined) {
    return "UTC";
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

export function zonedDayStart(day: string, timeZone: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  const wall = Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1);

  const first = wall - offsetAt(new Date(wall), timeZone);
  const second = wall - offsetAt(new Date(first), timeZone);

  return new Date(second);
}

export function zonedDayEnd(day: string, timeZone: string): Date {
  return zonedDayStart(dayAfter(day), timeZone);
}

function dayAfter(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + 1),
  );

  return next.toISOString().slice(0, 10);
}

export function uuidV7LowerBound(at: Date): string {
  const hex = Math.max(at.getTime(), 0).toString(16).padStart(12, "0");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7000-8000-000000000000`;
}
