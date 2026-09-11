const FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const SHORT = new Intl.DateTimeFormat(undefined, {
  month: "long",
  day: "numeric",
});

function label(day: string): string {
  const at = new Date(`${day}T00:00:00`);
  const today = new Date();
  const diff = Math.round(
    (new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    ).getTime() -
      at.getTime()) /
      86_400_000,
  );

  if (diff === 0) {
    return "Today";
  }

  if (diff === 1) {
    return "Yesterday";
  }

  return at.getFullYear() === today.getFullYear()
    ? SHORT.format(at)
    : FORMATTER.format(at);
}

export function DateDivider({ day }: { day: string }) {
  return (
    <div className="relative flex items-center justify-center px-5 py-2.5">
      <span aria-hidden className="absolute inset-x-5 h-px bg-border" />
      <span className="relative rounded-full border bg-background px-3 py-1 text-meta font-semibold text-muted-foreground shadow-e1">
        {label(day)}
      </span>
    </div>
  );
}
