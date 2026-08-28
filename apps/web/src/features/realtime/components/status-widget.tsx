import { useQuery } from "@tanstack/react-query";

import { statsQuery } from "@/features/realtime/api/stats";
import { useConnection } from "@/stores/connection";

const STATUS_LABEL = {
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected",
} as const;

const STATUS_TONE = {
  connecting: "bg-amber-500",
  connected: "bg-emerald-500",
  disconnected: "bg-destructive",
} as const;

export function StatusWidget() {
  const status = useConnection((state) => state.status);
  const instanceId = useConnection((state) => state.instanceId);

  const { data } = useQuery(statsQuery);

  return (
    <section
      aria-labelledby="status-widget-heading"
      className="flex items-center gap-3 rounded-lg border px-2.5 py-1.5 text-xs"
    >
      <h2 className="sr-only" id="status-widget-heading">
        Connection
      </h2>

      <p
        className="flex items-center gap-1.5 font-medium text-foreground"
        data-testid="socket-status"
      >
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${STATUS_TONE[status]}`}
        />
        {STATUS_LABEL[status]}
      </p>

      <p>
        <span className="text-muted-foreground">Instance </span>
        <span
          className="font-mono font-medium text-foreground"
          data-testid="serving-instance"
        >
          {instanceId ?? "—"}
        </span>
      </p>

      <p>
        <span className="text-muted-foreground">Online </span>
        <span className="font-medium text-foreground">
          {data === undefined ? "—" : data.onlineUsers}
        </span>
      </p>

      <p>
        <span className="text-muted-foreground">Sockets </span>
        <span className="font-medium text-foreground">
          {data === undefined ? "—" : data.sockets}
        </span>
      </p>
    </section>
  );
}
