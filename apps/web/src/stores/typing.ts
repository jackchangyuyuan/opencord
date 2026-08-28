import { create } from "zustand";

export const TYPING_TTL_MS = 5000;

type Timers = Map<string, ReturnType<typeof setTimeout>>;

const timers: Timers = new Map();

interface TypingState {
  byChannel: Record<string, string[]>;
  start: (channelId: string, userId: string) => void;
  stop: (channelId: string, userId: string) => void;
  reset: () => void;
}

function timerKey(channelId: string, userId: string): string {
  return `${channelId}:${userId}`;
}

export const useTyping = create<TypingState>()((set, get) => ({
  byChannel: {},

  start: (channelId, userId) => {
    const key = timerKey(channelId, userId);
    const running = timers.get(key);

    if (running !== undefined) {
      clearTimeout(running);
    }

    timers.set(
      key,
      setTimeout(() => {
        get().stop(channelId, userId);
      }, TYPING_TTL_MS),
    );

    set((state) => {
      const current = state.byChannel[channelId] ?? [];

      return current.includes(userId)
        ? state
        : {
            byChannel: {
              ...state.byChannel,
              [channelId]: [...current, userId],
            },
          };
    });
  },

  stop: (channelId, userId) => {
    const key = timerKey(channelId, userId);
    const running = timers.get(key);

    if (running !== undefined) {
      clearTimeout(running);
      timers.delete(key);
    }

    set((state) => {
      const current = state.byChannel[channelId] ?? [];

      return {
        byChannel: {
          ...state.byChannel,
          [channelId]: current.filter((entry) => entry !== userId),
        },
      };
    });
  },

  reset: () => {
    for (const running of timers.values()) {
      clearTimeout(running);
    }

    timers.clear();
    set({ byChannel: {} });
  },
}));
