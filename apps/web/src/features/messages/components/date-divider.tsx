const FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function DateDivider({ day }: { day: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium text-muted-foreground">
        {FORMATTER.format(new Date(`${day}T00:00:00`))}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
