import type { MessagePreview } from "@opencord/shared/types";
import { useQuery } from "@tanstack/react-query";
import { CornerUpRight } from "lucide-react";
import { useNavigate } from "react-router";

import { userQuery } from "@/features/users/api/queries";

export function ReplyContext({
  channelId,
  replyTo,
}: {
  channelId: string;
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

  return (
    <button
      className="flex w-full min-w-0 items-center gap-1.5 rounded px-1 text-left text-xs text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
      data-slot="reply-context"
      disabled={removed}
      onClick={() => {
        void navigate(
          `/app/channels/${channelId}?around=${encodeURIComponent(replyTo.id)}`,
        );
      }}
      type="button"
    >
      <CornerUpRight className="size-3 shrink-0" />
      <span className="font-medium">{author?.name ?? "Unknown"}</span>
      <span className="min-w-0 truncate">
        {removed ? "Original message deleted" : replyTo.content}
      </span>
    </button>
  );
}
