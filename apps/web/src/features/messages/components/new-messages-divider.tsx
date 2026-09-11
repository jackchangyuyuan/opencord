export function NewMessagesDivider() {
  return (
    <div
      className="relative flex items-center px-4 py-1.5"
      data-slot="new-messages-divider"
      role="separator"
    >
      <span aria-hidden="true" className="h-px flex-1 bg-destructive/60" />
      <span className="ml-2 rounded-full bg-destructive-solid px-2 py-0.5 text-micro font-semibold tracking-wide text-white uppercase">
        New
      </span>
    </div>
  );
}
