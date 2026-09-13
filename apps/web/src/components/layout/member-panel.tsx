import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  channelQuery,
  useActiveChannelId,
  useActiveServerId,
} from "@/features/channels/api/queries";
import { DmMemberList } from "@/features/dms/components/dm-member-list";
import { MemberList } from "@/features/members/components/member-list";
import { SearchPanel } from "@/features/search/components/search-panel";
import { useUi } from "@/stores/ui";

export function MemberPanel() {
  const channelId = useActiveChannelId();
  const activeServerId = useActiveServerId();
  const rightPanel = useUi((state) => state.rightPanel);
  const setRightPanel = useUi((state) => state.setRightPanel);

  const { data: channel } = useQuery({
    ...channelQuery(channelId ?? ""),
    enabled: channelId !== undefined,
  });

  if (rightPanel === null) {
    return null;
  }

  const search = rightPanel === "search";
  const dm = channelId !== undefined && channel?.serverId === null;

  return (
    <aside
      aria-labelledby="member-panel-heading"
      className="hidden min-h-0 w-72 shrink-0 flex-col border-l bg-sidebar lg:flex xl:w-80"
    >
      <div className="flex h-header shrink-0 items-center gap-2 border-b px-4">
        <h2
          className="min-w-0 flex-1 truncate text-base leading-tight font-semibold tracking-tight"
          id="member-panel-heading"
        >
          {search ? "Search" : "Members"}
        </h2>
        <Tooltip>
          <TooltipTrigger
            aria-label={search ? "Hide search" : "Hide members"}
            render={
              <Button
                className="text-muted-foreground"
                onClick={() => {
                  setRightPanel(null);
                }}
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <X />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {search ? "Hide search" : "Hide members"}
          </TooltipContent>
        </Tooltip>
      </div>
      {search ? (
        <SearchPanel />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          {dm ? (
            <DmMemberList channelId={channelId} />
          ) : (
            <MemberList serverId={activeServerId} />
          )}
        </ScrollArea>
      )}
    </aside>
  );
}
