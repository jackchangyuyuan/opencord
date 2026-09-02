import { useQuery } from "@tanstack/react-query";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { dmParticipantsQuery } from "@/features/dms/api/queries";
import { PresenceDot } from "@/features/members/components/presence-dot";
import { statusOf, usePresence } from "@/stores/presence";

export function DmMemberList({ channelId }: { channelId: string }) {
  const presence = usePresence((state) => state.byUser);
  const { data, isPending, isError } = useQuery(dmParticipantsQuery(channelId));

  if (isPending) {
    return (
      <ul className="flex flex-col gap-2 p-3">
        {["a", "b"].map((key) => (
          <li className="flex items-center gap-2" key={key}>
            <div className="size-7 animate-pulse rounded-full bg-muted" />
            <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
          </li>
        ))}
      </ul>
    );
  }

  if (isError) {
    return (
      <p className="p-4 text-sm text-muted-foreground" role="alert">
        Could not load the participants.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <section aria-labelledby="dm-participants-heading">
        <h3
          className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          id="dm-participants-heading"
        >
          In this conversation — {data.length}
        </h3>
        <ul className="flex flex-col gap-1">
          {data.map((participant) => (
            <li className="flex items-center gap-2" key={participant.id}>
              <span className="relative shrink-0">
                <Avatar aria-hidden className="size-7">
                  <AvatarImage
                    alt=""
                    src={participant.avatarUrl ?? undefined}
                  />
                  <AvatarFallback>
                    {participant.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -right-0.5 -bottom-0.5">
                  <PresenceDot status={statusOf(presence, participant.id)} />
                </span>
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm">
                  {participant.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  @{participant.username}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
