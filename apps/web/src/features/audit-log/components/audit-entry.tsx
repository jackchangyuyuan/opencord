import { useQuery } from "@tanstack/react-query";

import type { AuditLogEntry } from "@/features/audit-log/api/queries";
import { ACTION_COPY } from "@/features/audit-log/lib/actions";
import { userQuery } from "@/features/users/api/queries";

const WHEN = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function AuditEntry({ entry }: { entry: AuditLogEntry }) {
  const { data: actor } = useQuery(userQuery(entry.actorId));

  return (
    <li className="flex items-baseline gap-2 border-b py-2 text-sm last:border-b-0">
      <span className="font-medium">{actor?.name ?? "Someone"}</span>
      <span className="min-w-0 flex-1">{ACTION_COPY[entry.action]}</span>
      <time
        className="text-xs text-muted-foreground"
        dateTime={entry.createdAt}
      >
        {WHEN.format(new Date(entry.createdAt))}
      </time>
    </li>
  );
}
