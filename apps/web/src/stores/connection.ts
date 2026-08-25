import { create } from "zustand";

import { socket } from "@/lib/socket";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface ConnectionState {
  status: ConnectionStatus;
  instanceId: string | null;
  markConnected: () => void;
  markDisconnected: () => void;
  markReady: (instanceId: string) => void;
}

export const useConnection = create<ConnectionState>()((set) => ({
  status: socket.connected ? "connected" : "connecting",
  instanceId: null,
  markConnected: () => {
    set({ status: "connected" });
  },
  markDisconnected: () => {
    set({ status: "disconnected", instanceId: null });
  },
  markReady: (instanceId) => {
    set({ status: "connected", instanceId });
  },
}));

socket.on("connect", () => {
  useConnection.getState().markConnected();
});

socket.on("disconnect", () => {
  useConnection.getState().markDisconnected();
});

socket.on("connect_error", () => {
  useConnection.getState().markDisconnected();
});

socket.on("connection:ready", (payload) => {
  useConnection.getState().markReady(payload.instanceId);
});
