import { Permissions } from "@opencord/shared/permissions";
import { useQuery } from "@tanstack/react-query";
import { AtSign, Hash, Search, SlidersHorizontal, Users } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Truncated } from "@/components/ui/truncated";
import { channelQuery } from "@/features/channels/api/queries";
import { useActiveChannelId } from "@/features/channels/hooks/use-active-view";
import { dmParticipantsQuery } from "@/features/dms/api/queries";
import { PinList } from "@/features/messages/components/pin-list";
import {
  has,
  useChannelPermissions,
} from "@/features/permissions/hooks/use-permissions";
import { currentUserQuery } from "@/features/users/api/queries";
import { UserAvatar } from "@/features/users/components/user-avatar";
import { cn } from "@/lib/cn";
import { type RightPanel, useUi } from "@/stores/ui";

const PANELS = [
  { key: "members", label: "Members", hide: "Hide members", icon: <Users /> },
  { key: "search", label: "Search", hide: "Hide search", icon: <Search /> },
] satisfies {
  key: RightPanel;
  label: string;
  hide: string;
  icon: ReactNode;
}[];

function PanelToggle() {
  const rightPanel = useUi((state) => state.rightPanel);
  const setRightPanel = useUi((state) => state.setRightPanel);

  return (
    <div className="hidden items-center gap-0.5 rounded-xl border bg-muted p-1 md:flex">
      {PANELS.map((entry) => {
        const active = rightPanel === entry.key;

        return (
          <Tooltip key={entry.label}>
            <TooltipTrigger
              aria-label={active ? entry.hide : entry.label}
              aria-pressed={active}
              render={
                <Button
                  className={
                    active
                      ? "bg-background text-foreground shadow-e1"
                      : "text-muted-foreground"
                  }
                  onClick={() => {
                    setRightPanel(active ? null : entry.key);
                  }}
                  size="sm"
                  variant="ghost"
                />
              }
            >
              {entry.icon}
              <span className="hidden lg:inline">{entry.label}</span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {active ? entry.hide : entry.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function ChannelHeader({ drawer }: { drawer?: ReactNode }) {
  const channelId = useActiveChannelId();
  const openChannelSettings = useUi((state) => state.openChannelSettings);

  const channelPermissions = useChannelPermissions(channelId);

  const { data: channel } = useQuery({
    ...channelQuery(channelId ?? ""),
    enabled: channelId !== undefined,
  });

  const dm = channel?.serverId === null;

  const mayOpenChannelSettings =
    channelId !== undefined &&
    channel?.serverId != null &&
    has(channelPermissions, Permissions.VIEW_CHANNEL);

  const { data: me } = useQuery(currentUserQuery);
  const { data: participants } = useQuery({
    ...dmParticipantsQuery(channelId ?? ""),
    enabled: dm,
  });

  const counterpart = participants?.find((person) => person.id !== me?.id);

  const name =
    channel?.name ??
    (channelId === undefined
      ? "No channel selected"
      : dm
        ? (counterpart?.name ?? "Direct message")
        : "Channel");
  const topic = channel?.topic ?? "";

  return (
    <div className="flex h-header shrink-0 items-center gap-3 border-b bg-background px-4">
      {drawer}

      {dm && counterpart !== undefined ? (
        <UserAvatar
          avatarUrl={counterpart.avatarUrl}
          name={counterpart.name}
          ring="ring-background"
          size="md"
          userId={counterpart.id}
        />
      ) : (
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
        >
          {dm ? (
            <AtSign className="size-[1.125rem]" />
          ) : (
            <Hash className="size-[1.125rem]" />
          )}
        </span>
      )}

      <h2
        className={cn(
          "min-w-0 shrink-0 text-base leading-tight font-semibold tracking-tight",
          channel === undefined && "text-muted-foreground",
        )}
      >
        <Truncated value={name} />
      </h2>

      {topic === "" && counterpart === undefined ? null : (
        <div className="hidden min-w-0 items-center gap-3 md:flex">
          <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
          <p className="min-w-0 text-meta text-muted-foreground">
            <Truncated
              value={topic === "" ? `@${counterpart?.username ?? ""}` : topic}
            />
          </p>
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <PinList channelId={channelId} />
        {mayOpenChannelSettings ? (
          <Tooltip>
            <TooltipTrigger
              aria-label="Channel settings"
              render={
                <Button
                  className="text-muted-foreground"
                  onClick={() => {
                    openChannelSettings(channelId);
                  }}
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <SlidersHorizontal />
            </TooltipTrigger>
            <TooltipContent side="bottom">Channel settings</TooltipContent>
          </Tooltip>
        ) : null}
        <PanelToggle />
      </div>
    </div>
  );
}
