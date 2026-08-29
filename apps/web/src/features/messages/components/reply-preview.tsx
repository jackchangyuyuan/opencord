import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { userQuery } from "@/features/users/api/queries";
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

  return (
    <div
      className="flex items-center gap-2 border-t bg-muted/40 px-3 py-1.5 text-xs"
      data-slot="reply-preview"
    >
      <span className="text-muted-foreground">Replying to</span>
      <span className="font-medium">{author?.name ?? "Unknown"}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {target.content}
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
