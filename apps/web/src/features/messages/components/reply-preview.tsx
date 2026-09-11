import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MentionText } from "@/features/messages/components/mention-text";
import { userQuery } from "@/features/users/api/queries";
import { UserAvatar } from "@/features/users/components/user-avatar";
import { useUi } from "@/stores/ui";

export function ReplyPreview({ channelId }: { channelId: string }) {
  const replyTarget = useUi((state) => state.replyTarget);
  const setReplyTarget = useUi((state) => state.setReplyTarget);

  const target = replyTarget?.channelId === channelId ? replyTarget : null;

  const { data: author } = useQuery({
    ...userQuery(target?.authorId ?? ""),
    enabled: target !== null,
  });

  if (target === null) {
    return null;
  }

  const name = author?.name ?? "Unknown";

  return (
    <div
      className="flex items-center gap-2 border-t bg-muted/40 px-3 py-1.5 text-xs"
      data-slot="reply-preview"
    >
      <span className="shrink-0 text-muted-foreground">Replying to</span>
      <UserAvatar
        avatarUrl={author?.avatarUrl ?? null}
        name={name}
        showPresence={false}
        size="xs"
        userId={target.authorId}
      />
      <span className="max-w-40 shrink-0 truncate font-medium">{name}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        <MentionText channelId={channelId} content={target.content} />
      </span>
      <Button
        aria-label="Cancel reply"
        onClick={() => {
          setReplyTarget(null);
        }}
        size="icon-xs"
        variant="ghost"
      >
        <X />
      </Button>
    </div>
  );
}
