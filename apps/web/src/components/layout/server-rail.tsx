import { ScrollArea } from "@/components/ui/scroll-area";
import { useActiveServerId } from "@/features/channels/api/queries";
import { CreateServerDialog } from "@/features/servers/components/create-server-dialog";
import { ServerList } from "@/features/servers/components/server-list";

export function ServerRail() {
  const activeServerId = useActiveServerId();

  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-2 border-r bg-sidebar py-3">
      <h2 className="sr-only">Servers</h2>
      <ScrollArea className="w-full flex-1">
        <ServerList
          {...(activeServerId === undefined ? {} : { activeServerId })}
        />
      </ScrollArea>
      <CreateServerDialog />
    </div>
  );
}
