import { describe, expect, it } from "vitest";

import { aggregate, type Connection } from "./presence.js";

function connection(overrides: Partial<Connection> = {}): Connection {
  return { status: "online", idle: false, ...overrides };
}

describe("aggregate", () => {
  it("is offline with no connections", () => {
    expect(aggregate([])).toBe("offline");
  });

  it("is online while any connection is active", () => {
    expect(aggregate([connection()])).toBe("online");
    expect(
      aggregate([connection({ idle: true }), connection({ idle: false })]),
    ).toBe("online");
  });

  it("is idle only when every connection is idle", () => {
    expect(aggregate([connection({ idle: true })])).toBe("idle");
    expect(
      aggregate([connection({ idle: true }), connection({ idle: true })]),
    ).toBe("idle");
  });

  it("is dnd user-wide when any connection says so", () => {
    expect(
      aggregate([connection(), connection({ status: "dnd", idle: true })]),
    ).toBe("dnd");
    expect(
      aggregate([connection({ status: "dnd" }), connection({ idle: true })]),
    ).toBe("dnd");
  });

  it("prefers dnd over online and idle, in that order", () => {
    expect(
      aggregate([
        connection({ status: "idle", idle: true }),
        connection({ status: "dnd", idle: true }),
        connection({ status: "online", idle: false }),
      ]),
    ).toBe("dnd");
  });

  it("ignores a stale offline status on a live connection", () => {
    expect(aggregate([connection({ status: "offline", idle: false })])).toBe(
      "online",
    );
  });
});
