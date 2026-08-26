import { ScrollArea } from "@/components/ui/scroll-area";
import { useActiveServerId } from "@/features/channels/api/queries";
import { MemberList } from "@/features/members/components/member-list";

export function MemberPanel() {
  const activeServerId = useActiveServerId();

  return (
    <aside
      aria-labelledby="member-panel-heading"
      className="hidden w-56 shrink-0 flex-col border-l bg-sidebar lg:flex"
    >
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold" id="member-panel-heading">
          Members
        </h2>
      </div>
      <ScrollArea className="flex-1">
        <MemberList serverId={activeServerId} />
      </ScrollArea>
    </aside>
  );
}
