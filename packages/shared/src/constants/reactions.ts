export const REACTION_EMOJI = [
  "👍",
  "👎",
  "❤️",
  "🔥",
  "🎉",
  "😄",
  "😂",
  "😮",
  "😢",
  "😡",
  "🤔",
  "👀",
  "🙏",
  "👏",
  "💯",
  "✅",
  "❌",
  "⚠️",
  "🚀",
  "🐛",
  "💡",
  "📌",
  "🔒",
  "⏰",
  "☕",
  "🍕",
  "🤝",
  "🧠",
  "🙌",
  "🫡",
] as const;

export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJI as readonly string[]).includes(value);
}
