import type { PresenceStatus } from "@opencord/shared/types";
import { create } from "zustand";

export type SelfStatus = Extract<PresenceStatus, "online" | "idle" | "dnd">;

export const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do not disturb",
  offline: "Offline",
};

interface PresenceState {
  byUser: Record<string, PresenceStatus>;
  self: SelfStatus;
  setStatus: (userId: string, status: PresenceStatus) => void;
  setSelf: (status: SelfStatus) => void;
  reset: () => void;
}

export const usePresence = create<PresenceState>()((set) => ({
  byUser: {},
  self: "online",
  setStatus: (userId, status) => {
    set((state) => ({ byUser: { ...state.byUser, [userId]: status } }));
  },
  setSelf: (self) => {
    set({ self });
  },
  reset: () => {
    set({ byUser: {} });
  },
}));

export function statusOf(
  byUser: Record<string, PresenceStatus>,
  userId: string,
): PresenceStatus {
  return byUser[userId] ?? "offline";
}
