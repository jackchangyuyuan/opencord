import { CalendarDays } from "lucide-react";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { isDate } from "@/features/search/lib/query-token";

export const DATE_FORMAT = "YYYY-MM-DD";

export function DateFilterField({
  label,
  onCommit,
  onEscape,
  value,
}: {
  label: string;
  onCommit: (day: string) => void;
  onEscape: () => void;
  value: string;
}) {
  const hintId = useId();
  const [draft, setDraft] = useState(value);

  const malformed = draft.length === DATE_FORMAT.length && !isDate(draft);

  return (
    <div className="absolute inset-x-0 top-full z-30 mt-1.5 flex flex-col gap-1.5 rounded-2xl border bg-popover p-2.5 shadow-e3">
      <label className="flex min-w-0 items-center gap-2 text-meta text-muted-foreground">
        <CalendarDays aria-hidden className="size-4 shrink-0" />
        <span className="shrink-0">{label}</span>
        <Input
          {...(malformed ? { "aria-describedby": hintId } : {})}
          aria-invalid={malformed}
          autoComplete="off"
          className="h-8 font-mono tabular-nums"
          inputMode="numeric"
          maxLength={DATE_FORMAT.length}
          onChange={(event) => {
            const next = event.target.value;

            setDraft(next);

            if (isDate(next)) {
              onCommit(next);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onEscape();
              event.preventDefault();
            }
          }}
          pattern="\d{4}-\d{2}-\d{2}"
          placeholder={DATE_FORMAT}
          spellCheck={false}
          value={draft}
        />
      </label>

      {malformed ? (
        <p
          className="pl-6 text-micro text-destructive"
          id={hintId}
          role="alert"
        >
          That is not a day. Use {DATE_FORMAT}.
        </p>
      ) : null}
    </div>
  );
}
