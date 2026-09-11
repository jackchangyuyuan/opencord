const SETTLE_FRAMES = 12;

export const OPENING_FRAMES = 30;

const HOLD_MS = 900;

const BLOCKED_FRAME_CAP = 300;

const USER_SCROLL_EVENTS = ["wheel", "touchmove", "keydown"] as const;

export function watchReaderScroll(
  scroller: HTMLElement,
  onReach: () => void,
): () => void {
  const onGutter = (event: PointerEvent) => {
    if (
      event.clientX - scroller.getBoundingClientRect().left >
      scroller.clientWidth
    ) {
      onReach();
    }
  };

  for (const event of USER_SCROLL_EVENTS) {
    scroller.addEventListener(event, onReach, { passive: true });
  }

  scroller.addEventListener("pointerdown", onGutter, { passive: true });

  return () => {
    for (const event of USER_SCROLL_EVENTS) {
      scroller.removeEventListener(event, onReach);
    }

    scroller.removeEventListener("pointerdown", onGutter);
  };
}

export type ScrollAdjustment = (scroller: HTMLElement) => void;

function anchoredOverlayOpen(): boolean {
  return (
    document.querySelector('[role="menu"], [data-slot="popover-content"]') !==
    null
  );
}

export function settle(
  scroller: HTMLElement,
  adjust: ScrollAdjustment,
  frames: number = SETTLE_FRAMES,
): () => void {
  let left = frames;
  let ticks = BLOCKED_FRAME_CAP;
  let raf = 0;
  let surrendered = false;

  const surrender = () => {
    surrendered = true;
  };

  for (const event of USER_SCROLL_EVENTS) {
    scroller.addEventListener(event, surrender, { passive: true });
  }

  const tick = () => {
    if (surrendered) {
      return;
    }

    ticks -= 1;

    if (!anchoredOverlayOpen()) {
      adjust(scroller);
      left -= 1;
    }

    if (left > 0 && ticks > 0) {
      raf = requestAnimationFrame(tick);
    }
  };

  tick();

  return () => {
    cancelAnimationFrame(raf);

    for (const event of USER_SCROLL_EVENTS) {
      scroller.removeEventListener(event, surrender);
    }
  };
}

export function itemColumn(scroller: HTMLElement): HTMLElement | null {
  return (
    scroller.querySelector<HTMLElement>('[data-testid="virtuoso-item-list"]') ??
    (scroller.firstElementChild?.firstElementChild as HTMLElement | null) ??
    null
  );
}

export function holdRow(
  scroller: HTMLElement,
  find: () => HTMLElement | null,
  top: number,
  frames?: number,
): () => void {
  const pin = () => {
    const row = find();

    if (row === null) {
      return;
    }

    const drift = row.getBoundingClientRect().top - top;

    if (Math.abs(drift) > 0.5) {
      scroller.scrollTop += drift;
    }
  };

  const column = itemColumn(scroller);
  const observer = column === null ? null : new ResizeObserver(pin);

  if (column !== null) {
    observer?.observe(column);
  }

  const stopSettling = settle(scroller, pin, frames);

  const release = () => {
    observer?.disconnect();
    stopSettling();

    for (const event of USER_SCROLL_EVENTS) {
      scroller.removeEventListener(event, release);
    }

    window.clearTimeout(timer);
  };

  const timer = window.setTimeout(release, HOLD_MS);

  for (const event of USER_SCROLL_EVENTS) {
    scroller.addEventListener(event, release, { passive: true });
  }

  return release;
}

export function bottomDistance(scroller: HTMLElement): number {
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
}

const SUBPIXEL_SLACK = 1 / 1024;

const UNREACHABLE_CEILING = 1;

function bottomTolerance(): number {
  return (
    UNREACHABLE_CEILING + 1 / (window.devicePixelRatio || 1) + SUBPIXEL_SLACK
  );
}

export function toBottom(scroller: HTMLElement): void {
  if (bottomDistance(scroller) <= bottomTolerance()) {
    return;
  }

  scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
}

export function atBottom(scroller: HTMLElement): boolean {
  return bottomDistance(scroller) <= bottomTolerance();
}

const NEAR_BOTTOM_PX = 600;

export function nearBottom(scroller: HTMLElement): boolean {
  const distance = bottomDistance(scroller);

  return distance > bottomTolerance() && distance < NEAR_BOTTOM_PX;
}

export function farFromBottom(scroller: HTMLElement): boolean {
  return bottomDistance(scroller) >= NEAR_BOTTOM_PX;
}
