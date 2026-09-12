import type { QueryClient } from "@tanstack/react-query";

import {
  auditLogQuery,
  auditPeopleQuery,
  NO_AUDIT_FILTERS,
} from "@/features/audit-log/api/queries";
import { serverChannelsQuery } from "@/features/channels/api/queries";
import { serverInvitesQuery } from "@/features/invites/api/queries";
import {
  serverBansQuery,
  serverMembersQuery,
} from "@/features/members/api/queries";
import { serverRolesQuery } from "@/features/roles/api/queries";
import type { SettingsPageId } from "@/features/server-settings/lib/pages";

export function prefetchSettingsPage(
  queryClient: QueryClient,
  serverId: string,
  page: SettingsPageId,
): void {
  const warm = (run: Promise<unknown>) => {
    void run.catch(() => undefined);
  };

  switch (page) {
    case "overview": {
      warm(queryClient.query(serverRolesQuery(serverId)));
      warm(queryClient.query(serverChannelsQuery(serverId)));

      return;
    }

    case "roles": {
      warm(queryClient.query(serverRolesQuery(serverId)));

      return;
    }

    case "members": {
      warm(queryClient.query(serverRolesQuery(serverId)));
      warm(queryClient.infiniteQuery(serverMembersQuery(serverId)));

      return;
    }

    case "invites": {
      warm(queryClient.query(serverInvitesQuery(serverId)));

      return;
    }

    case "bans": {
      warm(queryClient.query(serverBansQuery(serverId)));

      return;
    }

    case "audit-log": {
      warm(queryClient.query(auditPeopleQuery(serverId)));
      warm(queryClient.query(serverChannelsQuery(serverId)));
      warm(queryClient.query(serverRolesQuery(serverId)));
      warm(
        queryClient.infiniteQuery(auditLogQuery(serverId, NO_AUDIT_FILTERS)),
      );
    }
  }
}
