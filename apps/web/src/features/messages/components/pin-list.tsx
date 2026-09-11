import { useQuery } from "@tanstack/react-query";
import { Pin } from "lucide-react";
import { useNavigate } from "react-router";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { channelPinsQuery } from "@/features/messages/api/queries";
import { MentionText } from "@/features/messages/components/mention-text";
import { userQuery } from "@/features/users/api/queries";

function PinRow({
  authorId,
  channelId,
  content,
  messageId,
}: {
  authorId: string;
  channelId: string;
  content: string;
  messageId: string;
}) {
  const navigate = useNavigate();
  const { data: author } = useQuery(userQuery(authorId));

  return (
    <li>
      <button
        className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => {
          void navigate(
            `/app/channels/${channelId}?around=${encodeURIComponent(messageId)}`,
          );
        }}
        type="button"
      >
        <span className="text-xs font-medium">{author?.name ?? "Unknown"}</span>
        <span className="line-clamp-2 text-sm text-muted-foreground">
          <MentionText channelId={channelId} content={content} />
        </span>
      </button>
    </li>
  );
}

export function PinList({ channelId }: { channelId: string | undefined }) {
  const enabled = channelId !== undefined;

  const { data, isPending, isError } = useQuery({
    ...channelPinsQuery(channelId ?? ""),
    enabled,
  });

  if (!enabled) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button aria-label="Pinned messages" size="sm" variant="outline" />
        }
      >
        <Pin />
        Pins
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <h3 className="px-2 text-xs font-semibold">Pinned messages</h3>
        {isPending ? (
          <div aria-hidden className="flex flex-col gap-1 p-2">
            {["a", "b", "c"].map((key) => (
              <Skeleton className="h-6" key={key} />
            ))}
          </div>
        ) : isError ? (
          <p className="px-2 text-sm text-muted-foreground" role="alert">
            Could not load the pins.
          </p>
        ) : data.length === 0 ? (
          <EmptyState
            description="Pin a message from its context menu to keep it here."
            title="Nothing is pinned yet"
          />
        ) : (
          <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
            {data.map((message) => (
              <PinRow
                authorId={message.authorId}
                channelId={channelId}
                content={message.content}
                key={message.id}
                messageId={message.id}
              />
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
