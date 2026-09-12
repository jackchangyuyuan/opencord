import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { dmParticipantsQuery } from "@/features/dms/api/queries";
import { MemberIdentity } from "@/features/members/components/member-identity";
import { UserAvatar } from "@/features/users/components/user-avatar";
import { UserProfilePopover } from "@/features/users/components/user-profile-popover";

export function DmMemberList({ channelId }: { channelId: string }) {
  const { data, isPending, isError } = useQuery(dmParticipantsQuery(channelId));

  if (isPending) {
    return (
      <div aria-hidden className="flex flex-col gap-3 p-5">
        {["a", "b"].map((key) => (
          <div className="flex items-center gap-3" key={key}>
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-3.5 flex-1" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="p-4 text-body text-muted-foreground" role="alert">
        Could not load the participants.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-2 pt-4 pb-6">
      <section aria-labelledby="dm-participants-heading">
        <h3
          className="mb-2 px-3 text-micro font-semibold tracking-[0.1em] text-muted-foreground uppercase"
          id="dm-participants-heading"
        >
          In this conversation{" "}
          <span className="font-normal tabular-nums">{data.length}</span>
        </h3>
        <ul className="flex flex-col gap-0.5">
          {data.map((participant) => (
            <li
              className="flex items-center rounded-xl transition-colors duration-100 hover:bg-accent/60"
              key={participant.id}
            >
              <UserProfilePopover
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                label={`${participant.name}'s profile`}
                side="left"
                userId={participant.id}
              >
                <UserAvatar
                  avatarUrl={participant.avatarUrl}
                  name={participant.name}
                  size="sm"
                  userId={participant.id}
                />
                <MemberIdentity
                  customStatus={participant.customStatus}
                  customStatusEmoji={participant.customStatusEmoji}
                  name={participant.name}
                />
              </UserProfilePopover>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
