import { useQuery } from "@tanstack/react-query";

import { ScrollArea } from "@/components/ui/scroll-area";
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
      className="hidden w-72 shrink-0 flex-col border-l bg-sidebar lg:flex"
    >
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold" id="member-panel-heading">
          {search ? "Search" : "Members"}
        </h2>
      </div>
      {search ? (
        <SearchPanel />
      ) : (
        <ScrollArea className="flex-1">
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
