export type OverwriteState = "allow" | "neutral" | "deny";

export interface OverwriteMasks {
  allow: number;
  deny: number;
}

export function stateOf(
  allow: number,
  deny: number,
  bit: number,
): OverwriteState {
  if ((allow & bit) === bit) {
    return "allow";
  }

  return (deny & bit) === bit ? "deny" : "neutral";
}

export function withState(
  masks: OverwriteMasks,
  bit: number,
  state: OverwriteState,
): OverwriteMasks {
  return {
    allow: state === "allow" ? masks.allow | bit : masks.allow & ~bit,
    deny: state === "deny" ? masks.deny | bit : masks.deny & ~bit,
  };
}
