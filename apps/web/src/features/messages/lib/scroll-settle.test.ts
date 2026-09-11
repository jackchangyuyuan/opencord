import { describe, expect, it, vi } from "vitest";

import {
  atBottom,
  bottomDistance,
  farFromBottom,
  nearBottom,
  toBottom,
  watchReaderScroll,
} from "./scroll-settle";

function scroller({
  scrollHeight,
  scrollTop,
  clientHeight = 700,
  clientWidth = 400,
  left = 0,
}: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight?: number;
  clientWidth?: number;
  left?: number;
}): HTMLElement {
  const element = document.createElement("div");

  Object.defineProperties(element, {
    scrollHeight: { value: scrollHeight },
    scrollTop: { value: scrollTop, writable: true },
    clientHeight: { value: clientHeight },
    clientWidth: { value: clientWidth },
  });

  element.getBoundingClientRect = () =>
    ({ left, top: 0, width: clientWidth, height: clientHeight }) as DOMRect;

  return element;
}

describe("bottomDistance", () => {
  it("is how far the scroller is from the true bottom", () => {
    expect(
      bottomDistance(scroller({ scrollHeight: 2000, scrollTop: 1300 })),
    ).toBe(0);
    expect(
      bottomDistance(scroller({ scrollHeight: 2000, scrollTop: 1200 })),
    ).toBe(100);
  });
});

describe("nearBottom and farFromBottom", () => {
  it("treats a row's worth of drift as still at the bottom", () => {
    const grown = scroller({ scrollHeight: 2009, scrollTop: 1300 });

    expect(nearBottom(grown)).toBe(true);
    expect(farFromBottom(grown)).toBe(false);
  });

  it("treats a jump up the history as having left it", () => {
    const jumped = scroller({ scrollHeight: 8000, scrollTop: 1300 });

    expect(nearBottom(jumped)).toBe(false);
    expect(farFromBottom(jumped)).toBe(true);
  });

  it("says neither of a list that is exactly on its bottom", () => {
    const settled = scroller({ scrollHeight: 2000, scrollTop: 1300 });

    expect(nearBottom(settled)).toBe(false);
    expect(farFromBottom(settled)).toBe(false);
  });
});

describe("watchReaderScroll", () => {
  it("reports the three gestures that scroll a list", () => {
    const element = scroller({ scrollHeight: 2000, scrollTop: 1300 });
    const reached = vi.fn();
    const release = watchReaderScroll(element, reached);

    element.dispatchEvent(new Event("wheel"));
    element.dispatchEvent(new Event("touchmove"));
    element.dispatchEvent(new Event("keydown"));

    expect(reached).toHaveBeenCalledTimes(3);

    release();
    element.dispatchEvent(new Event("wheel"));

    expect(reached).toHaveBeenCalledTimes(3);
  });

  it("reports a pointer landing in the scrollbar gutter", () => {
    const element = scroller({ scrollHeight: 2000, scrollTop: 1300 });
    const reached = vi.fn();

    watchReaderScroll(element, reached);
    element.dispatchEvent(new PointerEvent("pointerdown", { clientX: 412 }));

    expect(reached).toHaveBeenCalledTimes(1);
  });

  it("ignores a pointer landing on the content", () => {
    const element = scroller({ scrollHeight: 2000, scrollTop: 1300 });
    const reached = vi.fn();

    watchReaderScroll(element, reached);
    element.dispatchEvent(new PointerEvent("pointerdown", { clientX: 120 }));

    expect(reached).not.toHaveBeenCalled();
  });
});

describe("the bottom's tolerance", () => {
  const withRatio = <T>(ratio: number, run: () => T): T => {
    const original = window.devicePixelRatio;

    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: ratio,
    });

    try {
      return run();
    } finally {
      Object.defineProperty(window, "devicePixelRatio", {
        configurable: true,
        value: original,
      });
    }
  };

  it("counts a gap smaller than one device pixel as the bottom", () => {
    withRatio(1.6, () => {
      expect(
        atBottom(scroller({ scrollHeight: 2000, scrollTop: 1299.5 })),
      ).toBe(true);
      expect(
        atBottom(scroller({ scrollHeight: 2000, scrollTop: 1299.375 })),
      ).toBe(true);
      expect(atBottom(scroller({ scrollHeight: 2000, scrollTop: 1298 }))).toBe(
        false,
      );
    });
  });

  it("counts the bottom on the ratio a browser actually reports", () => {
    withRatio(1.600000023841858, () => {
      const settled = scroller({ scrollHeight: 2000, scrollTop: 1299.375 });

      expect(atBottom(settled)).toBe(true);

      toBottom(settled);

      expect(settled.scrollTop).toBe(1299.375);
    });
  });

  it("covers the ceiling scrollHeight rounds a fractional box up to", () => {
    withRatio(1.6, () => {
      const settled = scroller({ scrollHeight: 2000, scrollTop: 1299.125 });

      expect(atBottom(settled)).toBe(true);

      toBottom(settled);

      expect(settled.scrollTop).toBe(1299.125);
    });
  });

  it("still moves for a gap past the two roundings together", () => {
    withRatio(1.6, () => {
      const short = scroller({ scrollHeight: 2000, scrollTop: 1297 });

      expect(atBottom(short)).toBe(false);

      toBottom(short);

      expect(short.scrollTop).toBe(1300);
    });
  });

  it("keeps a display-dependent part on top of the fixed one", () => {
    const short = scroller({ scrollHeight: 2000, scrollTop: 1298.2 });

    expect(withRatio(1, () => atBottom(short))).toBe(true);
    expect(withRatio(2, () => atBottom(short))).toBe(false);
  });

  it("does not write a correction it cannot draw", () => {
    withRatio(1.6, () => {
      const settled = scroller({ scrollHeight: 2000, scrollTop: 1299.5 });

      toBottom(settled);

      expect(settled.scrollTop).toBe(1299.5);

      const short = scroller({ scrollHeight: 2000, scrollTop: 1250 });

      toBottom(short);

      expect(short.scrollTop).toBe(1300);
    });
  });

  it("leaves the same gap alone in nearBottom", () => {
    withRatio(1.6, () => {
      expect(
        nearBottom(scroller({ scrollHeight: 2000, scrollTop: 1299.5 })),
      ).toBe(false);
      expect(
        nearBottom(scroller({ scrollHeight: 2000, scrollTop: 1295 })),
      ).toBe(true);
    });
  });
});
