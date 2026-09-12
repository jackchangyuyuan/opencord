import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Truncated } from "@/components/ui/truncated";
import { AuditLogPage } from "@/features/audit-log/components/audit-log-page";
import { InvitesPage } from "@/features/invites/components/invites-page";
import { BansPage } from "@/features/members/components/bans-page";
import { MembersPage } from "@/features/members/components/members-page";
import { useServerPermissions } from "@/features/permissions/hooks/use-permissions";
import { RolesPage } from "@/features/roles/components/roles-page";
import { SettingsNav } from "@/features/server-settings/components/settings-nav";
import { SettingsStateProvider } from "@/features/server-settings/components/settings-state-provider";
import {
  resolvePage,
  type SettingsPageId,
  visibleGroups,
} from "@/features/server-settings/lib/pages";
import { prefetchSettingsPage } from "@/features/server-settings/lib/prefetch";
import { serversQuery } from "@/features/servers/api/queries";
import { OverviewPage } from "@/features/servers/components/overview-page";
import { useUi } from "@/stores/ui";

export function ServerSettingsDialog({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const permissions = useServerPermissions(serverId);
  const activeModal = useUi((state) => state.activeModal);
  const openModal = useUi((state) => state.openModal);
  const closeModal = useUi((state) => state.closeModal);

  const panelId = useId();
  const [requested, setRequested] = useState<SettingsPageId>("overview");

  const { data: servers } = useQuery(serversQuery);

  const server = servers?.find((entry) => entry.id === serverId);
  const groups = visibleGroups(permissions);
  const page = resolvePage(requested, groups);

  const open = activeModal === "server-settings";
  useEffect(() => {
    if (!open) {
      return;
    }

    for (const group of visibleGroups(permissions)) {
      for (const entry of group.pages) {
        prefetchSettingsPage(queryClient, serverId, entry.id);
      }
    }
  }, [open, permissions, queryClient, serverId]);

  if (server === undefined || page === null) {
    return null;
  }

  const initials = server.name.slice(0, 2).toUpperCase();

  return (
    <Dialog
      onOpenChange={(next) => {
        if (next) {
          openModal("server-settings");
        } else {
          closeModal();
          setRequested("overview");
        }
      }}
      open={open}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger
              aria-label="Server settings"
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
          <Settings />
        </TooltipTrigger>
        <TooltipContent side="bottom">Server settings</TooltipContent>
      </Tooltip>

      <DialogContent className="h-[min(45rem,calc(100svh-2rem))] grid-rows-[auto_minmax(0,1fr)] gap-5 overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <div className="flex min-w-0 items-center gap-3">
            <Avatar aria-hidden className="size-9">
              <AvatarImage alt="" src={server.iconUrl ?? undefined} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <DialogTitle className="min-w-0">
                <Truncated value={server.name} />
              </DialogTitle>
              <p className="text-xs text-muted-foreground">Server settings</p>
            </div>
          </div>
          <DialogDescription className="sr-only">
            Settings for {server.name}.
          </DialogDescription>
        </DialogHeader>

        <SettingsStateProvider>
          <div className="flex min-h-0 min-w-0 flex-col gap-4 sm:flex-row sm:gap-5">
            <div className="shrink-0 border-b pb-3 sm:border-r sm:border-b-0 sm:pr-4 sm:pb-0">
              <SettingsNav
                groups={groups}
                onSelect={setRequested}
                page={page}
                panelId={panelId}
              />
            </div>

            <div
              aria-label="Server settings"
              className="flex min-h-0 min-w-0 flex-1 flex-col"
              id={panelId}
              role="region"
            >
              {page === "overview" ? (
                <OverviewPage onDone={closeModal} server={server} />
              ) : null}
              {page === "roles" ? <RolesPage serverId={serverId} /> : null}
              {page === "members" ? <MembersPage serverId={serverId} /> : null}
              {page === "invites" ? <InvitesPage serverId={serverId} /> : null}
              {page === "bans" ? <BansPage serverId={serverId} /> : null}
              {page === "audit-log" ? (
                <AuditLogPage serverId={serverId} />
              ) : null}
            </div>
          </div>
        </SettingsStateProvider>
      </DialogContent>
    </Dialog>
  );
}
