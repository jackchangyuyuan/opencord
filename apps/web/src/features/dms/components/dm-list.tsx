import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useActiveChannelId } from "@/features/channels/api/queries";
import { UnreadBadge } from "@/features/channels/components/unread-badge";
import { dmsQuery } from "@/features/dms/api/queries";
import { cn } from "@/lib/cn";

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function DmList() {
  const activeChannelId = useActiveChannelId();
  const { data, isPending, isError } = useQuery(dmsQuery);

  if (isPending) {
    return (
      <ul className="flex flex-col gap-1 p-2">
        {["a", "b", "c"].map((key) => (
          <li key={key}>
            <div className="h-9 animate-pulse rounded-lg bg-muted" />
          </li>
        ))}
      </ul>
    );
  }

  if (isError) {
    return (
      <p className="p-4 text-sm text-muted-foreground" role="alert">
        Could not load direct messages.
      </p>
    );
  }

  if (data.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No direct messages yet. Open one from a member list.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5 p-2">
      {data.map((dm) => (
        <li key={dm.id}>
          <NavLink
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
              "focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
              dm.id === activeChannelId &&
                "bg-muted font-medium text-foreground",
            )}
            to={`/app/channels/${dm.id}`}
            {...(dm.id === activeChannelId
              ? { "aria-current": "page" as const }
              : {})}
          >
            <Avatar aria-hidden className="size-6">
              <AvatarImage alt="" src={dm.recipient.avatarUrl ?? undefined} />
              <AvatarFallback className="text-[10px]">
                {initials(dm.recipient.name)}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "truncate",
                dm.hasUnread && "font-semibold text-foreground",
              )}
            >
              {dm.recipient.name}
            </span>
            <UnreadBadge label={dm.recipient.name} state={dm} />
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
