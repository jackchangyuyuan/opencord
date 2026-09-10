import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import {
  ANY_DATE,
  type DateRange,
  DAY_PRESETS,
  dayError,
  daysAgo,
  describeRange,
  isWholeDay,
  rangeError,
} from "@/components/data-list/date-range";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/cn";

export function DateRangeFilter({
  label = "Date",
  onChange,
  value,
}: {
  label?: string | undefined;
  onChange: (next: DateRange) => void;
  value: DateRange;
}) {
  const fromId = useId();
  const toId = useId();
  const errorId = useId();

  const [draft, setDraft] = useState(() => ({
    from: value.from ?? "",
    to: value.to ?? "",
  }));

  const [seen, setSeen] = useState(value);

  if (seen.from !== value.from || seen.to !== value.to) {
    setSeen(value);
    setDraft({ from: value.from ?? "", to: value.to ?? "" });
  }

  const problem =
    dayError(draft.from) ??
    dayError(draft.to) ??
    rangeError(draft.from, draft.to);

  const edit = (end: "from" | "to", next: string) => {
    const merged = { ...draft, [end]: next };

    setDraft(merged);

    if (next === "") {
      onChange({ ...value, [end]: null });
    } else if (
      isWholeDay(next) &&
      rangeError(merged.from, merged.to) === null
    ) {
      onChange({ ...value, [end]: next });
    }
  };

  const summary = describeRange(value);
  const active = summary !== null;

  const box = (end: "from" | "to") => (
    <Input
      aria-describedby={problem === null ? undefined : errorId}
      aria-invalid={dayError(draft[end]) !== null || problem !== null}
      autoComplete="off"
      className="h-8 font-mono text-xs tabular-nums"
      id={end === "from" ? fromId : toId}
      inputMode="numeric"
      maxLength={10}
      onChange={(event) => {
        edit(end, event.target.value);
      }}
      placeholder="YYYY-MM-DD"
      spellCheck={false}
      value={draft[end]}
    />
  );

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            className={cn(
              "max-w-52 justify-between font-normal",
              active && "border-ring/60 bg-muted font-medium text-foreground",
            )}
            size="sm"
            variant="outline"
          />
        }
      >
        <span className="truncate">
          {summary === null ? label : `${label}: ${summary}`}
        </span>
        <ChevronDown data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-3">
        <div className="flex flex-col gap-1">
          {DAY_PRESETS.map((preset) => (
            <Button
              className="justify-start font-normal"
              key={preset.label}
              onClick={() => {
                onChange({ from: daysAgo(preset.days), to: null });
              }}
              size="sm"
              variant="ghost"
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <label
              className="w-10 shrink-0 text-xs text-muted-foreground"
              htmlFor={fromId}
            >
              From
            </label>
            {box("from")}
          </div>
          <div className="flex items-center gap-2">
            <label
              className="w-10 shrink-0 text-xs text-muted-foreground"
              htmlFor={toId}
            >
              To
            </label>
            {box("to")}
          </div>

          {problem === null ? null : (
            <p className="text-xs text-destructive" id={errorId} role="alert">
              {problem}
            </p>
          )}
        </div>

        {active ? (
          <Button
            className="self-start"
            onClick={() => {
              onChange(ANY_DATE);
            }}
            size="sm"
            variant="ghost"
          >
            Clear date
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
