export const MENTION_PATTERN = /@([A-Za-z0-9_.-]+)/g;
export const CHANNEL_MENTION_PATTERN = /#([a-z0-9-]+)/g;

export const STORED_MENTION_PATTERN = /<(@&?|#)([^<>\s]+)>/g;

export const RESOLVABLE_MENTION_NAME = /^[A-Za-z0-9_.-]+$/;

export const BROADCAST_TOKENS = ["everyone", "here"] as const;

export type BroadcastToken = (typeof BROADCAST_TOKENS)[number];

export function isBroadcastToken(value: string): value is BroadcastToken {
  return (BROADCAST_TOKENS as readonly string[]).includes(value);
}

export const MENTION_MARKER_PATTERN =
  /<(@&?|#)([^<>\s]+)>|@(everyone|here)(?![A-Za-z0-9_.-])/g;
