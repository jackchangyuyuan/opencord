import { useQuery } from "@tanstack/react-query";

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

  if (others.length === 0) {
    return null;
  }

  return (
    <p
      aria-live="polite"
      className="px-4 pb-1 text-xs text-muted-foreground"
      data-slot="typing-row"
    >
      {others.slice(0, 3).map((userId, index) => (
        <span key={userId}>
          {index === 0 ? null : ", "}
          <Name userId={userId} />
        </span>
      ))}
      {others.length === 1 ? " is typing…" : " are typing…"}
    </p>
  );
}
