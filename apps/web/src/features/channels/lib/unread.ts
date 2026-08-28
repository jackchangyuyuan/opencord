export interface UnreadState {
  hasUnread: boolean;
  hasEveryone: boolean;
  mentionCount: number;
}

export const NOTHING_UNREAD: UnreadState = {
  hasUnread: false,
  hasEveryone: false,
  mentionCount: 0,
};

export function badgeCount(state: UnreadState): number {
  if (state.mentionCount > 0) {
    return state.mentionCount;
  }

  return state.hasEveryone ? 1 : 0;
}

export function rollUp(states: readonly UnreadState[]): UnreadState {
  return {
    hasUnread: states.some((state) => state.hasUnread),
    hasEveryone: states.some((state) => state.hasEveryone),
    mentionCount: states.reduce(
      (total, state) => total + state.mentionCount,
      0,
    ),
  };
}
