import { Permissions } from "@opencord/shared/permissions";
import { useInfiniteQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { auditLogQuery } from "@/features/audit-log/api/queries";
import { AuditEntry } from "@/features/audit-log/components/audit-entry";
import {
  has,
  useServerPermissions,
} from "@/features/permissions/hooks/use-permissions";

export function AuditLogTab({ serverId }: { serverId: string }) {
  const permissions = useServerPermissions(serverId);
  const mayRead = has(permissions, Permissions.MANAGE_SERVER);

  const entries = useInfiniteQuery({
    ...auditLogQuery(serverId),
    enabled: mayRead,
  });

  if (!mayRead) {
    return null;
  }

  if (entries.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (entries.isError) {
    return (
      <p className="text-sm text-muted-foreground" role="alert">
        Could not load this server&rsquo;s moderation record.
      </p>
    );
  }

  const rows = entries.data.pages.flatMap((page) => page.data);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        This server&rsquo;s moderation record, newest first.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing has happened yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((entry) => (
            <AuditEntry entry={entry} key={entry.id} />
          ))}
        </ul>
      )}

      {entries.hasNextPage ? (
        <Button
          disabled={entries.isFetchingNextPage}
          onClick={() => void entries.fetchNextPage()}
          size="sm"
          variant="ghost"
        >
          {entries.isFetchingNextPage ? "Loading…" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}
