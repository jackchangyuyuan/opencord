import { useConnection } from "@/stores/connection";

export function ConnectionStatus() {
  const status = useConnection((state) => state.status);
  const instanceId = useConnection((state) => state.instanceId);

  return (
    <p>
      {status}
      {instanceId === null ? null : ` · ${instanceId}`}
    </p>
  );
}
