import { useCallback, useLayoutEffect, useRef, useState } from "react";

export function useClipped<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [clipped, setClipped] = useState(false);

  const measure = useCallback(() => {
    const element = ref.current;

    if (element === null) {
      return;
    }

    setClipped(element.scrollWidth - element.clientWidth > 1);
  }, []);

  useLayoutEffect(measure);

  useLayoutEffect(() => {
    const element = ref.current;

    if (element === null || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(measure);

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [measure]);

  return { clipped, ref };
}
