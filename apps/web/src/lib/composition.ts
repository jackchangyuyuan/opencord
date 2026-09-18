import type { KeyboardEvent } from "react";

export function isComposing(event: KeyboardEvent): boolean {
  return event.nativeEvent.isComposing;
}
