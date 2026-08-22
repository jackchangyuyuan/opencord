import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor } from "./cursor.js";

const id = "01a09114-6030-7337-8ba0-90b8a73c1574";

describe("the keyset cursor codec", () => {
  it("round-trips an identifier", () => {
    expect(decodeCursor(encodeCursor(id))).toBe(id);
  });

  it("encodes to a url-safe string", () => {
    expect(encodeCursor(id)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("encodes rather than passing the identifier through", () => {
    expect(encodeCursor(id)).not.toBe(id);
  });

  it("rejects a cursor that is not base64url of a uuid", () => {
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(encodeCursor("hello"))).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it("rejects an uppercase uuid, keeping one spelling per identifier", () => {
    expect(decodeCursor(encodeCursor(id.toUpperCase()))).toBeNull();
  });

  it("survives every identifier the database can generate", () => {
    for (const candidate of [
      "00000000-0000-7000-8000-000000000000",
      "ffffffff-ffff-7fff-bfff-ffffffffffff",
      id,
    ]) {
      expect(decodeCursor(encodeCursor(candidate))).toBe(candidate);
    }
  });
});
