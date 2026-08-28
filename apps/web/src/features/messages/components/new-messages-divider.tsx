export function NewMessagesDivider() {
  return (
    <div
      className="flex items-center gap-3 px-4 py-1"
      data-slot="new-messages-divider"
      role="separator"
    >
      <span aria-hidden="true" className="h-px flex-1 bg-destructive" />
      <span className="text-[0.625rem] font-semibold tracking-wide text-destructive uppercase">
        New messages
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-destructive" />
    </div>
  );
}
