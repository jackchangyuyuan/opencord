export function MemberIdentity({
  customStatus,
  customStatusEmoji,
  name,
}: {
  customStatus: string | null;
  customStatusEmoji: string | null;
  name: string;
}) {
  const announcing = customStatus !== null || customStatusEmoji !== null;

  return (
    <span className="flex min-w-0 flex-1 flex-col justify-center">
      <span className="role-color min-w-0 truncate text-body leading-tight">
        {name}
      </span>
      {announcing ? (
        <span className="mt-0.5 min-w-0 truncate text-micro leading-tight text-muted-foreground">
          {customStatusEmoji === null ? null : (
            <span className="mr-1">{customStatusEmoji}</span>
          )}
          {customStatus}
        </span>
      ) : null}
    </span>
  );
}
