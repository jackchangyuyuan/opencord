import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { sessionQuery } from "@/features/auth/hooks/use-session";
import { socket } from "@/lib/socket";

export function useSocketConnection(userId: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (userId === null) {
      socket.disconnect();
      return;
    }

    socket.disconnect();
    socket.connect();

    const reopen = (reason: string) => {
      if (reason !== "io server disconnect") {
        return;
      }

      queryClient
        .query({ ...sessionQuery, staleTime: 0 })
        .then((session) => {
          if (session?.user.id === userId) {
            socket.connect();
          }
        })
        .catch(() => undefined);
    };

    socket.on("disconnect", reopen);

    return () => {
      socket.off("disconnect", reopen);
    };
  }, [queryClient, userId]);
}
