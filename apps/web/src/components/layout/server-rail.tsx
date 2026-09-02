import { MessagesSquare } from "lucide-react";
import { NavLink } from "react-router";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useActiveServerId } from "@/features/channels/api/queries";
import { CreateServerDialog } from "@/features/servers/components/create-server-dialog";
import { ServerList } from "@/features/servers/components/server-list";
import { cn } from "@/lib/cn";

export function ServerRail() {
  const activeServerId = useActiveServerId();

  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-2 border-r bg-sidebar py-3">
      <h2 className="sr-only">Servers</h2>
      <NavLink
        className={({ isActive }) =>
          cn(
            "flex size-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground",
            "focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
            isActive && "text-foreground ring-2 ring-ring",
          )
        }
        to="/app/dms"
      >
        <MessagesSquare aria-hidden className="size-5" />
        <span className="sr-only">Direct messages</span>
      </NavLink>
      <Separator className="w-8" />
      <ScrollArea className="w-full flex-1">
        <ServerList
          {...(activeServerId === undefined ? {} : { activeServerId })}
        />
      </ScrollArea>
      <CreateServerDialog />
    </div>
  );
}
