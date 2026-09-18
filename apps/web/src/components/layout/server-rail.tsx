import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import type { ReactElement } from "react";
import { NavLink } from "react-router";

import {
  RAIL_GUTTER,
  RAIL_TILE,
  railIndicator,
} from "@/components/layout/nav-styles";
import { BrandMark } from "@/components/ui/brand-mark";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UnreadBadge } from "@/features/channels/components/unread-badge";
import {
  useActiveServerId,
  useOnDirectMessages,
} from "@/features/channels/hooks/use-active-view";
import { dmBadgeCount, rollUp } from "@/features/channels/lib/unread";
import { dmsQuery } from "@/features/dms/api/queries";
import { CreateServerDialog } from "@/features/servers/components/create-server-dialog";
import { ServerList } from "@/features/servers/components/server-list";
import { cn } from "@/lib/cn";
import { useIsMobile } from "@/lib/use-media-query";

export function RailTooltip({
  children,
  label,
}: {
  children: ReactElement;
  label: string;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return children;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ServerRail() {
  const activeServerId = useActiveServerId();
  const onDms = useOnDirectMessages();
  const { data: dms } = useQuery(dmsQuery);

  const conversations = dms ?? [];
  const dmUnread = rollUp(conversations);
  const dmCount = conversations.reduce(
    (total, dm) => total + dmBadgeCount(dm),
    0,
  );

  return (
    <div className="flex w-22 shrink-0 flex-col items-center gap-1 border-r bg-rail py-3 text-rail-foreground">
      <h2 className="sr-only">Servers</h2>

      <span
        aria-hidden
        className="flex size-11 items-center justify-center rounded-2xl bg-brand text-brand-foreground shadow-e2"
      >
        <BrandMark className="size-6" />
      </span>

      <span aria-hidden className="my-2 h-px w-8 bg-border" />

      <div className={RAIL_GUTTER}>
        <RailTooltip label="Direct Messages">
          <NavLink
            className={cn(
              RAIL_TILE,
              "overflow-visible bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
              onDms &&
                "bg-background text-foreground ring-2 ring-brand/70 ring-offset-2 ring-offset-rail",
            )}
            to="/app/dms"
          >
            <span
              aria-hidden
              className={railIndicator(
                onDms ? "active" : dmCount > 0 ? "unread" : "idle",
              )}
            />
            <MessagesSquare aria-hidden className="size-[1.375rem]" />
            <span className="sr-only">Direct Messages</span>
            <UnreadBadge
              className="absolute -top-1 -right-1 ml-0 ring-2 ring-rail"
              count={dmCount}
              countOnly
              label="Direct messages"
              noun="message"
              state={dmUnread}
            />
          </NavLink>
        </RailTooltip>
      </div>

      <ScrollArea className="min-h-0 w-full flex-1">
        <ServerList
          {...(activeServerId === undefined ? {} : { activeServerId })}
        />
      </ScrollArea>

      <div className={RAIL_GUTTER}>
        <CreateServerDialog />
      </div>
    </div>
  );
}
