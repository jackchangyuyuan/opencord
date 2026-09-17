import { describe, expect, it } from "vitest";

import {
  createRandom,
  messageBody,
  timeline,
  topicFor,
  TOPICS,
} from "./corpus.js";

describe("the seed corpus", () => {
  it("is reproducible from its seed", () => {
    const first = Array.from({ length: 20 }, () => 0);
    const engine = createRandom(1234);
    const other = createRandom(1234);

    expect(first.map(() => engine.next())).toEqual(
      first.map(() => other.next()),
    );
  });

  it("writes about the channel it is for, not Lorem ipsum", () => {
    const random = createRandom(7);
    const topic = topicFor("engineering");

    const body = Array.from({ length: 40 }, () =>
      messageBody(random, topic),
    ).join(" ");

    expect(body).not.toContain("Lorem");
    expect(topic.subjects.some((subject) => body.includes(subject))).toBe(true);
  });

  it("falls back to a real topic for an unknown channel", () => {
    expect(TOPICS).toContain(topicFor("no-such-channel"));
  });

  it("lays a timeline out in ascending order inside its window", () => {
    const start = Date.UTC(2025, 0, 1);
    const end = Date.UTC(2026, 0, 1);
    const stamps = timeline(500, start, end);

    expect(stamps).toHaveLength(500);
    expect(stamps[0]).toBeGreaterThanOrEqual(start);
    expect(stamps.at(-1)).toBeLessThanOrEqual(end);

    expect(
      stamps.every((at, index) => index === 0 || at > (stamps[index - 1] ?? 0)),
    ).toBe(true);
  });

  it("stays ascending once jitter is applied", () => {
    const start = Date.UTC(2025, 0, 1);
    const end = Date.UTC(2026, 0, 1);
    const stamps = timeline(2000, start, end, createRandom(99));

    expect(
      stamps.every((at, index) => index === 0 || at > (stamps[index - 1] ?? 0)),
    ).toBe(true);
  });

  it("puts two channels on different milliseconds", () => {
    const start = Date.UTC(2025, 0, 1);
    const end = Date.UTC(2026, 0, 1);

    const left = timeline(500, start, end, createRandom(1));
    const right = timeline(500, start, end, createRandom(2));

    expect(left.filter((at) => right.includes(at))).toEqual([]);
  });

  it("returns nothing for an empty window", () => {
    expect(timeline(0, 0, 1000)).toEqual([]);
  });
});
