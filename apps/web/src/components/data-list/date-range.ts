export interface DateRange {
  from: string | null;
  to: string | null;
}

export const ANY_DATE: DateRange = { from: null, to: null };

export function daysAgo(days: number): string {
  const at = new Date();

  at.setHours(0, 0, 0, 0);
  at.setDate(at.getDate() - days);

  return [
    String(at.getFullYear()).padStart(4, "0"),
    String(at.getMonth() + 1).padStart(2, "0"),
    String(at.getDate()).padStart(2, "0"),
  ].join("-");
}

export const DAY_PRESETS = [
  { label: "Today", days: 0 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
] as const;

export function describeRange(range: DateRange): string | null {
  if (range.from === null && range.to === null) {
    return null;
  }

  const preset = DAY_PRESETS.find(
    (entry) => range.to === null && range.from === daysAgo(entry.days),
  );

  if (preset !== undefined) {
    return preset.label;
  }

  if (range.to === null) {
    return `From ${range.from ?? ""}`;
  }

  if (range.from === null) {
    return `Until ${range.to}`;
  }

  return `${range.from} → ${range.to}`;
}

const PARTIAL = /^\d{1,4}(-(\d{1,2}(-\d{1,2})?)?)?$/;
const WHOLE = /^\d{4}-\d{2}-\d{2}$/;

export function isWholeDay(text: string): boolean {
  if (!WHOLE.test(text)) {
    return false;
  }

  const [year = 0, month = 0, day = 0] = text.split("-").map(Number);
  const at = new Date(0);

  at.setUTCFullYear(year, month - 1, day);

  return (
    at.getUTCFullYear() === year &&
    at.getUTCMonth() === month - 1 &&
    at.getUTCDate() === day
  );
}

export function dayError(text: string): string | null {
  if (text === "" || (PARTIAL.test(text) && text.length < 10)) {
    return null;
  }

  if (!WHOLE.test(text)) {
    return "Dates are written YYYY-MM-DD, like 2026-09-17.";
  }

  return isWholeDay(text) ? null : "That day does not exist.";
}

export function rangeError(from: string, to: string): string | null {
  if (!isWholeDay(from) || !isWholeDay(to) || from <= to) {
    return null;
  }

  return "The first date is after the last one.";
}
