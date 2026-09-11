import { useQuery } from "@tanstack/react-query";

import { statsQuery } from "@/features/realtime/api/stats";
import { useConnection } from "@/stores/connection";

const STATUS_LABEL = {
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected",
} as const;

const STATUS_TONE = {
  connecting: "bg-presence-idle",
  connected: "bg-presence-online",
  disconnected: "bg-destructive",
} as const;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p className="hidden items-baseline gap-1.5 sm:flex">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-meta font-medium text-foreground tabular-nums">
        {value}
      </span>
    </p>
  );
}

export function StatusWidget() {
  const status = useConnection((state) => state.status);
  const instanceId = useConnection((state) => state.instanceId);

  const { data } = useQuery(statsQuery);

  return (
    <section
      aria-labelledby="status-widget-heading"
      className="flex min-w-0 items-center gap-4 text-meta *:shrink-0"
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

      <span aria-hidden className="hidden h-4 w-px bg-border sm:block" />

      <p className="flex items-baseline gap-1.5">
        <span className="text-muted-foreground">Instance</span>
        <span
          className="font-mono text-meta font-medium text-foreground"
          data-testid="serving-instance"
        >
          {instanceId ?? "—"}
        </span>
      </p>

      <span aria-hidden className="hidden h-4 w-px bg-border sm:block" />

      <Field
        label="Online"
        value={data === undefined ? "—" : String(data.onlineUsers)}
      />
      <Field
        label="Sockets"
        value={data === undefined ? "—" : String(data.sockets)}
      />
    </section>
  );
}
