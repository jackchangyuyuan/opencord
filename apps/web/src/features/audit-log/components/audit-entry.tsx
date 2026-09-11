import { useQuery } from "@tanstack/react-query";

import type { AuditLogEntry } from "@/features/audit-log/api/queries";
import { describeAudit, relativeTime } from "@/features/audit-log/lib/describe";
import { userQuery } from "@/features/users/api/queries";

const EXACT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const PEOPLE = new Set(["member", "user"]);

export function AuditEntry({
  entry,
  channelName,
  roleName,
}: {
  entry: AuditLogEntry;
  channelName: string | null;
  roleName: string | null;
}) {
  const { data: actor } = useQuery(userQuery(entry.actorId));

  const targetUserId =
    entry.targetId !== null && PEOPLE.has(entry.targetType ?? "")
      ? entry.targetId
      : null;

  const { data: target } = useQuery({
    ...userQuery(targetUserId ?? ""),
    enabled: targetUserId !== null,
  });

  const authorId =
    typeof entry.metadata === "object" &&
    entry.metadata !== null &&
    typeof (entry.metadata as Record<string, unknown>)["authorId"] === "string"
      ? ((entry.metadata as Record<string, unknown>)["authorId"] as string)
      : null;

  const { data: author } = useQuery({
    ...userQuery(authorId ?? ""),
    enabled: authorId !== null,
  });

  const who = (user: { username: string } | undefined) =>
    user === undefined ? "an unknown account" : `@${user.username}`;

  const story = describeAudit(entry, {
    actor: who(actor),
    author: authorId === null ? null : who(author),
    channel: channelName,
    role: roleName,
    target: targetUserId === null ? null : who(target),
  });

  const at = new Date(entry.createdAt);

  return (
    <li className="flex flex-col gap-0.5 border-b py-2.5 last:border-b-0">
      <p className="text-sm leading-snug text-muted-foreground">
        {story.parts.map((part, index) =>
          part.kind === "name" ? (
            <span
              className="font-medium text-foreground"
              key={`${String(index)}:${part.text}`}
            >
              {part.text}
            </span>
          ) : (
            <span key={`${String(index)}:${part.text}`}>{part.text}</span>
          ),
        )}
      </p>

      {story.detail === null ? null : (
        <p className="text-xs text-muted-foreground">{story.detail}</p>
      )}

      {story.reason === null ? null : (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Reason:</span> {story.reason}
        </p>
      )}

      <time
        className="text-micro text-muted-foreground/80"
        dateTime={entry.createdAt}
        title={EXACT.format(at)}
      >
        {relativeTime(entry.createdAt)}
      </time>
    </li>
  );
}
