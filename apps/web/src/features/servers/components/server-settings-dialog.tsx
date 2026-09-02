import { Permissions } from "@opencord/shared/permissions";
import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuditLogTab } from "@/features/audit-log/components/audit-log-tab";
import { OverwriteEditor } from "@/features/channels/components/overwrite-editor";
import { BanList } from "@/features/members/components/ban-list";
import {
  has,
  useServerPermissions,
} from "@/features/permissions/hooks/use-permissions";
import { RoleList } from "@/features/roles/components/role-list";
import { serversQuery } from "@/features/servers/api/queries";
import { ServerOverviewTab } from "@/features/servers/components/server-overview-tab";
import { useUi } from "@/stores/ui";

export function ServerSettingsDialog({ serverId }: { serverId: string }) {
  const permissions = useServerPermissions(serverId);
  const activeModal = useUi((state) => state.activeModal);
  const openModal = useUi((state) => state.openModal);
  const closeModal = useUi((state) => state.closeModal);

  const { data: servers } = useQuery(serversQuery);

  const server = servers?.find((entry) => entry.id === serverId);

  const mayManageServer = has(permissions, Permissions.MANAGE_SERVER);

  if (server === undefined || !has(permissions, Permissions.VIEW_CHANNEL)) {
    return null;
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          openModal("server-settings");
        } else {
          closeModal();
        }
      }}
      open={activeModal === "server-settings"}
    >
      <DialogTrigger
        aria-label="Server settings"
        render={<Button size="icon-xs" variant="ghost" />}
      >
        <Settings />
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{server.name}</DialogTitle>
          <DialogDescription>
            Settings for this server and its members.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="overwrites">Channel access</TabsTrigger>
            <TabsTrigger value="bans">Bans</TabsTrigger>
            {mayManageServer ? (
              <TabsTrigger value="audit-log">Moderation record</TabsTrigger>
            ) : null}
          </TabsList>
          <TabsContent value="overview">
            <ServerOverviewTab onDone={closeModal} server={server} />
          </TabsContent>
          <TabsContent value="roles">
            <RoleList serverId={serverId} />
          </TabsContent>
          <TabsContent value="overwrites">
            <OverwriteEditor serverId={serverId} />
          </TabsContent>
          <TabsContent value="bans">
            <BanList serverId={serverId} />
          </TabsContent>
          {mayManageServer ? (
            <TabsContent value="audit-log">
              <AuditLogTab serverId={serverId} />
            </TabsContent>
          ) : null}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
