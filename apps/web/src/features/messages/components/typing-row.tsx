import { useQuery } from "@tanstack/react-query";
import { Type } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { currentUserQuery, userQuery } from "@/features/users/api/queries";
import { useTyping } from "@/stores/typing";

function Name({ userId }: { userId: string }) {
  const { data } = useQuery(userQuery(userId));

  return <>{data?.name ?? "Someone"}</>;
}

export function TypingRow({ channelId }: { channelId: string }) {
  const { data: me } = useQuery(currentUserQuery);
  const typing = useTyping((state) => state.byChannel[channelId]);

  const others = (typing ?? []).filter((userId) => userId !== me?.id);

  return (
    <div
      className="flex h-5 shrink-0 items-center gap-3 px-5"
      data-slot="typing-row"
    >
      <p
        aria-live="polite"
        className="flex h-5 min-w-0 flex-1 items-center gap-2 text-meta leading-[normal] text-muted-foreground"
      >
        {others.length === 0 ? null : (
          <>
            <span aria-hidden className="flex shrink-0 items-center gap-0.5">
              {[0, 1, 2].map((index) => (
                <span
                  className="typing-dot size-1.25 rounded-full bg-muted-foreground"
                  key={index}
                  style={{ animationDelay: `${String(index * 0.16)}s` }}
                />
              ))}
            </span>
            <span className="truncate">
              {others.slice(0, 3).map((userId, index) => (
                <span key={userId}>
                  {index === 0 ? null : ", "}
                  <Name userId={userId} />
                </span>
              ))}
              {others.length === 1 ? " is typing…" : " are typing…"}
            </span>
          </>
        )}
      </p>

      <Tooltip>
        <TooltipTrigger
          render={
            <span className="flex h-5 shrink-0 items-center gap-1.5 text-meta leading-[normal] text-muted-foreground" />
          }
        >
          <Type aria-hidden className="size-3.5" />
          Markdown supported
        </TooltipTrigger>
        <TooltipContent side="top">
          **bold**, *italic*, `code`, &gt; quotes, - lists and links
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
