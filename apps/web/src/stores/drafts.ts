import { create } from "zustand";

interface DraftsState {
  byChannel: Record<string, string>;
  setDraft: (channelId: string, value: string) => void;
  clearDraft: (channelId: string) => void;
  reset: () => void;
}

export const useDrafts = create<DraftsState>()((set) => ({
  byChannel: {},
  setDraft: (channelId, value) => {
    set((state) => ({ byChannel: { ...state.byChannel, [channelId]: value } }));
  },
  clearDraft: (channelId) => {
    set((state) => ({
      byChannel: Object.fromEntries(
        Object.entries(state.byChannel).filter(([key]) => key !== channelId),
      ),
    }));
  },
  reset: () => {
    set({ byChannel: {} });
  },
}));

export function useDraft(channelId: string | undefined): string {
  return useDrafts((state) =>
    channelId === undefined ? "" : (state.byChannel[channelId] ?? ""),
  );
}
