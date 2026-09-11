import { describe, expect, it } from "vitest";

import { JUMP_COMFORT, revealDelta } from "./reply-jump";

const VIEWPORT = { viewportBottom: 800, viewportTop: 100 };

function at(top: number, height = 60) {
  return { ...VIEWPORT, itemBottom: top + height, itemTop: top };
}

function landsAt(geometry: ReturnType<typeof at>) {
  const delta = revealDelta(geometry);

  return {
    bottom: geometry.itemBottom - delta,
    delta,
    top: geometry.itemTop - delta,
  };
}

describe("revealDelta", () => {
  it("does not move for a target that is already on screen", () => {
    expect(revealDelta(at(300))).toBe(0);
  });

  it("does not move for a target flush with either edge", () => {
    expect(revealDelta(at(100))).toBe(0);
    expect(revealDelta(at(740))).toBe(0);
  });

  it("reveals a target just above the fold against the top edge", () => {
    const landed = landsAt(at(70));

    expect(landed.delta).toBe(-54);
    expect(landed.top).toBe(VIEWPORT.viewportTop + JUMP_COMFORT);
  });

  it("reveals a target just below the fold against the bottom edge", () => {
    const landed = landsAt(at(760));

    expect(landed.delta).toBe(44);
    expect(landed.bottom).toBe(VIEWPORT.viewportBottom - JUMP_COMFORT);
  });

  it("moves only the distance a few rows out of sight needs", () => {
    const landed = landsAt(at(-120));

    expect(landed.delta).toBe(-244);
    expect(landed.top).toBe(124);
  });

  it("centres a target further than a viewport away", () => {
    const landed = landsAt(at(-800));

    expect(landed.top + landed.bottom).toBeCloseTo(
      VIEWPORT.viewportTop + VIEWPORT.viewportBottom,
      5,
    );
  });

  it("centres a target more than a viewport below", () => {
    const landed = landsAt(at(1600));

    expect(landed.top + landed.bottom).toBeCloseTo(
      VIEWPORT.viewportTop + VIEWPORT.viewportBottom,
      5,
    );
  });

  it("switches from a reveal to a centring at a viewport of travel", () => {
    expect(landsAt(at(100 + JUMP_COMFORT - 700)).top).toBe(124);
    expect(landsAt(at(100 + JUMP_COMFORT - 701)).top).not.toBe(124);
  });

  it("opens a message taller than the viewport at its start", () => {
    const landed = landsAt(at(900, 1100));

    expect(landed.top).toBe(VIEWPORT.viewportTop + JUMP_COMFORT);
  });

  it("opens a message that cannot fit with margins at its start", () => {
    const landed = landsAt(at(60, 680));

    expect(landed.top).toBe(VIEWPORT.viewportTop + JUMP_COMFORT);
  });
});
