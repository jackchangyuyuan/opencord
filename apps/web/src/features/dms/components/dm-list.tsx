import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { NavLink } from "react-router";

import { EmptyState } from "@/components/layout/empty-state";
import { navMarker, navRow } from "@/components/layout/nav-styles";
import { Skeleton } from "@/components/ui/skeleton";
import { TruncatedControl } from "@/components/ui/truncated";
import { UnreadBadge } from "@/features/channels/components/unread-badge";
import { useRequestedChannelId } from "@/features/channels/hooks/use-active-view";
import { usePrefetchChannel } from "@/features/channels/lib/load-view";
import { dmBadgeCount } from "@/features/channels/lib/unread";
import { type DmEntry, dmsQuery } from "@/features/dms/api/queries";
import { UserAvatar } from "@/features/users/components/user-avatar";
import { UserProfilePopover } from "@/features/users/components/user-profile-popover";
import { cn } from "@/lib/cn";
import { useClipped } from "@/lib/use-clipped";

function DmRow({
  active,
  dm,
  onPrefetch,
}: {
  active: boolean;
  dm: DmEntry;
  onPrefetch: (channelId: string) => void;
}) {
  const count = dmBadgeCount(dm);
  const unread = dm.hasUnread || count > 0;
  const { clipped, ref } = useClipped<HTMLSpanElement>();

  return (
    <li className="relative">
      <UserProfilePopover
        className="absolute top-1/2 left-3 z-10 size-9 -translate-y-1/2 rounded-full focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        label={`${dm.recipient.name}'s profile`}
        side="right"
        userId={dm.recipient.id}
      />
      <TruncatedControl clipped={clipped} value={dm.recipient.name}>
        <NavLink
          className={navRow(active)}
          onFocus={() => {
            onPrefetch(dm.id);
          }}
          onPointerEnter={() => {
            onPrefetch(dm.id);
          }}
          to={`/app/channels/${dm.id}`}
          {...(active ? { "aria-current": "page" as const } : {})}
        >
          <span aria-hidden className={navMarker(active)} />
          <UserAvatar
            avatarUrl={dm.recipient.avatarUrl}
            name={dm.recipient.name}
            size="sm"
            userId={dm.recipient.id}
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              unread && !active && "font-semibold text-foreground",
            )}
            ref={ref}
          >
            {dm.recipient.name}
          </span>
          <UnreadBadge
            count={count}
            label={dm.recipient.name}
            noun="message"
            state={dm}
          />
        </NavLink>
      </TruncatedControl>
    </li>
  );
}

export function DmList() {
  const activeChannelId = useRequestedChannelId();
  const prefetch = usePrefetchChannel();
  const { data, isPending, isError } = useQuery(dmsQuery);

  if (isPending) {
    return (
      <div aria-hidden className="flex flex-col gap-1.5 p-2">
        {["a", "b", "c"].map((key) => (
          <Skeleton className="h-12 rounded-lg" key={key} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="p-4 text-body text-muted-foreground" role="alert">
        Could not load direct messages.
      </p>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        description="Open one from a member list, and it will appear here."
        icon={<MessageSquare aria-hidden className="size-5" />}
        title="No direct messages yet"
      />
    );
  }

  return (
    <ul className="flex flex-col gap-0.5 p-2">
      {data.map((dm) => (
        <DmRow
          active={dm.id === activeChannelId}
          dm={dm}
          key={dm.id}
          onPrefetch={prefetch}
        />
      ))}
    </ul>
  );
}
