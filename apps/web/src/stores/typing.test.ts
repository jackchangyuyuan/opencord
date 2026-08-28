import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TYPING_TTL_MS, useTyping } from "./typing";

const CHANNEL_ID = "c-1";

function typists(channelId = CHANNEL_ID): string[] {
  return useTyping.getState().byChannel[channelId] ?? [];
}

beforeEach(() => {
  vi.useFakeTimers();
  useTyping.getState().reset();
});

afterEach(() => {
  useTyping.getState().reset();
  vi.useRealTimers();
});

describe("the typing store", () => {
  it("shows a typist and forgets them ~5 s later with no server message", () => {
    useTyping.getState().start(CHANNEL_ID, "u-ada");

    expect(typists()).toEqual(["u-ada"]);

    vi.advanceTimersByTime(TYPING_TTL_MS - 1);

    expect(typists()).toEqual(["u-ada"]);

    vi.advanceTimersByTime(1);

    expect(typists()).toEqual([]);
  });

  it("restarts the timer on each event rather than stacking them", () => {
    useTyping.getState().start(CHANNEL_ID, "u-ada");

    vi.advanceTimersByTime(TYPING_TTL_MS - 500);

    useTyping.getState().start(CHANNEL_ID, "u-ada");

    vi.advanceTimersByTime(600);

    expect(typists()).toEqual(["u-ada"]);

    vi.advanceTimersByTime(TYPING_TTL_MS);

    expect(typists()).toEqual([]);
  });

  it("never lists the same typist twice", () => {
    useTyping.getState().start(CHANNEL_ID, "u-ada");
    useTyping.getState().start(CHANNEL_ID, "u-ada");

    expect(typists()).toEqual(["u-ada"]);
  });

  it("keeps each channel's typists apart", () => {
    useTyping.getState().start(CHANNEL_ID, "u-ada");
    useTyping.getState().start("c-2", "u-grace");

    expect(typists()).toEqual(["u-ada"]);
    expect(typists("c-2")).toEqual(["u-grace"]);

    vi.advanceTimersByTime(TYPING_TTL_MS);

    expect(typists()).toEqual([]);
    expect(typists("c-2")).toEqual([]);
  });

  it("expires one typist without touching another", () => {
    useTyping.getState().start(CHANNEL_ID, "u-ada");

    vi.advanceTimersByTime(2000);

    useTyping.getState().start(CHANNEL_ID, "u-grace");

    vi.advanceTimersByTime(TYPING_TTL_MS - 2000);

    expect(typists()).toEqual(["u-grace"]);
  });
});
