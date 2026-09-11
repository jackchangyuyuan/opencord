import type { MessagePreview } from "@opencord/shared/types";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { MentionText } from "@/features/messages/components/mention-text";
import { userQuery } from "@/features/users/api/queries";
import { UserAvatar } from "@/features/users/components/user-avatar";

const GUTTER = "3.75rem";
const AVATAR_CENTRE = "1.375rem";

export function ReplyContext({
  channelId,
  onJump,
  replyTo,
}: {
  channelId: string;
  onJump?: (messageId: string) => void;
  replyTo: MessagePreview | null;
}) {
  const navigate = useNavigate();

  const { data: author } = useQuery({
    ...userQuery(replyTo?.authorId ?? ""),
    enabled: replyTo !== null,
  });

  if (replyTo === null) {
    return null;
  }

  const removed = replyTo.deletedAt !== null;
  const name = author?.name ?? "Unknown";

  return (
    <div
      className="relative flex min-w-0 pb-0.5"
      style={{ paddingLeft: GUTTER }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 -bottom-0.5 rounded-tl-lg border-t border-l border-border"
        style={{
          left: AVATAR_CENTRE,
          width: `calc(${GUTTER} - ${AVATAR_CENTRE})`,
        }}
      />

      <button
        className="group/reply flex w-full min-w-0 items-center gap-1.5 rounded text-left text-meta text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-70"
        tabIndex={-1}
        data-slot="reply-context"
        disabled={removed}
        onClick={() => {
          if (onJump !== undefined) {
            onJump(replyTo.id);

            return;
          }

          void navigate(
            `/app/channels/${channelId}?around=${encodeURIComponent(replyTo.id)}`,
          );
        }}
        type="button"
      >
        <UserAvatar
          avatarUrl={author?.avatarUrl ?? null}
          name={name}
          showPresence={false}
          size="xs"
          userId={replyTo.authorId}
        />
        <span className="max-w-40 shrink-0 truncate font-medium text-foreground/80 group-hover/reply:text-foreground">
          {name}
        </span>
        <span className="min-w-0 flex-1 truncate whitespace-nowrap group-hover/reply:text-foreground">
          {removed ? (
            "Original message deleted"
          ) : (
            <MentionText channelId={channelId} content={replyTo.content} />
          )}
        </span>
      </button>
    </div>
  );
}
