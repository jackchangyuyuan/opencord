import { useEffect, useState } from "react";

import { socket } from "../../../lib/socket";

type Status = "connecting" | "connected" | "disconnected";

export function ConnectionStatus() {
  const [status, setStatus] = useState<Status>(() =>
    socket.connected ? "connected" : "connecting",
  );
  const [instanceId, setInstanceId] = useState<string | null>(null);

  useEffect(() => {
    const onConnect = () => {
      setStatus("connected");
    };

    const onDisconnect = () => {
      setStatus("disconnected");
      setInstanceId(null);
    };

    const onReady = (payload: { instanceId: string }) => {
      setInstanceId(payload.instanceId);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connection:ready", onReady);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connection:ready", onReady);
    };
  }, []);

  return (
    <p>
      {status}
      {instanceId === null ? null : ` · ${instanceId}`}
    </p>
  );
}
