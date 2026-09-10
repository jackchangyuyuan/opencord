import type { PresenceStatus } from "@opencord/shared/types";
import { useQuery } from "@tanstack/react-query";

import { currentUserQuery } from "@/features/users/api/queries";
import { statusOf, usePresence } from "@/stores/presence";

export function useUserPresence(userId: string | undefined): PresenceStatus {
  const byUser = usePresence((state) => state.byUser);
  const self = usePresence((state) => state.self);
  const { data: me } = useQuery(currentUserQuery);

  if (userId === undefined) {
    return "offline";
  }

  return userId === me?.id ? self : statusOf(byUser, userId);
}
