import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { sessionQueryKey } from "@/features/auth/hooks/use-session";
import { resetSendBlock } from "@/features/messages/hooks/use-send-message";
import type { Session } from "@/lib/auth-client";
import { useDrafts } from "@/stores/drafts";
import { usePresence } from "@/stores/presence";
import { useTyping } from "@/stores/typing";
import { useUi } from "@/stores/ui";

function isSessionQuery(queryKey: QueryKey): boolean {
  return queryKey[0] === sessionQueryKey[0];
}

function forgetAccountState(client: QueryClient): void {
  void client.resetQueries({
    predicate: (query) => !isSessionQuery(query.queryKey),
  });

  useDrafts.getState().reset();
  useUi.getState().forgetAccount();
  useTyping.getState().reset();
  usePresence.getState().reset();
  usePresence.getState().setSelf("online");
  resetSendBlock();
}

function userIdOf(data: unknown): string | null {
  return (data as Session | null)?.user.id ?? null;
}

export function watchIdentity(client: QueryClient): () => void {
  let signedIn: string | null | undefined;

  return client.getQueryCache().subscribe((event) => {
    const queryKey = event.query.queryKey as QueryKey;

    if (!isSessionQuery(queryKey) || event.query.state.status !== "success") {
      return;
    }

    const next = userIdOf(event.query.state.data);

    if (signedIn === undefined) {
      signedIn = next;
      return;
    }

    if (next === signedIn) {
      return;
    }

    signedIn = next;
    forgetAccountState(client);
  });
}
