import { useCallback, useRef } from "react";

export function fromPointer(event: { detail: number }): boolean {
  return event.detail > 0;
}

export function releaseAfterPointer(
  event: { detail: number } & { currentTarget: HTMLElement },
): void {
  if (fromPointer(event)) {
    event.currentTarget.blur();
  }
}

export function usePointerActivationLatch(): {
  note: (event: { detail: number }) => void;
  finalFocus: () => boolean;
} {
  const releasingRef = useRef(false);

  const note = useCallback((event: { detail: number }) => {
    releasingRef.current = fromPointer(event);
  }, []);

  const finalFocus = useCallback(() => {
    const release = releasingRef.current;

    releasingRef.current = false;

    return !release;
  }, []);

  return { note, finalFocus };
}
