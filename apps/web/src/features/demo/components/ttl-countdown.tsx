function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatRemaining(remainingMs: number): string {
  const seconds = Math.floor(remainingMs / 1000);

  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

export function TtlCountdown({ remainingMs }: { remainingMs: number }) {
  return (
    <span className="font-mono tabular-nums" role="timer">
      {formatRemaining(remainingMs)}
    </span>
  );
}
