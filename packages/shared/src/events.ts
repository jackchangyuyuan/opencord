export type ClientToServerEvents = Record<string, never>;

export interface ServerToClientEvents {
  "connection:ready": (p: { instanceId: string }) => void;
}
