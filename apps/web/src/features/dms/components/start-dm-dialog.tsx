import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOpenDm } from "@/features/dms/api/queries";
import { serverMembersQuery } from "@/features/members/api/queries";
import { serversQuery } from "@/features/servers/api/queries";
import { currentUserQuery } from "@/features/users/api/queries";

function useCandidates(serverId: string | undefined) {
  const { data: me } = useQuery(currentUserQuery);
  const { data } = useInfiniteQuery({
    ...serverMembersQuery(serverId ?? ""),
    enabled: serverId !== undefined,
  });

  return (data?.pages ?? [])
    .flatMap((page) => page.data)
    .map((member) => member.user)
    .filter((user) => user.id !== me?.id);
}

export function StartDmDialog() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const { data: servers } = useQuery(serversQuery);
  const candidates = useCandidates(servers?.[0]?.id);
  const { openDm, error } = useOpenDm();

  const needle = filter.trim().toLowerCase();
  const shown = candidates.filter(
    (user) =>
      needle === "" ||
      user.name.toLowerCase().includes(needle) ||
      user.username.toLowerCase().includes(needle),
  );

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger
              aria-label="Start a direct message"
              render={
                <Button
                  className="text-muted-foreground"
                  size="icon-sm"
                  variant="ghost"
                />
              }
            />
          }
        >
          <MessageSquarePlus />
        </TooltipTrigger>
        <TooltipContent side="bottom">Start a direct message</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a direct message</DialogTitle>
          <DialogDescription>Anyone you share a server with.</DialogDescription>
        </DialogHeader>

        <Input
          aria-label="Filter people"
          onChange={(event) => {
            setFilter(event.target.value);
          }}
          placeholder="Filter people"
          value={filter}
        />

        {error === null ? null : (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <ScrollArea className="max-h-72">
          <ul className="flex flex-col gap-0.5">
            {shown.map((user) => (
              <li key={user.id}>
                <Button
                  className="w-full justify-start"
                  onClick={() => {
                    openDm(user.id);
                    setOpen(false);
                  }}
                  variant="ghost"
                >
                  {user.name}
                  <span className="text-xs text-muted-foreground">
                    @{user.username}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
