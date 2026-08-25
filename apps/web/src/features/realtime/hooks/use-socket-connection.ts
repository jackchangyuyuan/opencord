import { useEffect } from "react";

import { socket } from "@/lib/socket";

export function useSocketConnection(authenticated: boolean): void {
  useEffect(() => {
    if (authenticated) {
      socket.connect();
      return;
    }

    socket.disconnect();
  }, [authenticated]);
}
