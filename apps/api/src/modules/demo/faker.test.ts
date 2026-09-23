import { describe, expect, it } from "vitest";

import { seededFaker } from "./faker.js";

const ONE = 20260913;
const ANOTHER = 486231;

describe("seededFaker", () => {
  it("gives every seed a generator of its own", async () => {
    const one = await seededFaker(ONE);
    const another = await seededFaker(ANOTHER);

    expect(one).not.toBe(another);
  });

  it("leaves one stream where it was when another is drawn from", async () => {
    const before = await seededFaker(ONE);
    const expected = [before.number.int(), before.number.int()];

    const one = await seededFaker(ONE);
    const another = await seededFaker(ANOTHER);

    expect(one.number.int()).toBe(expected[0]);

    another.number.int();
    another.number.int();
    another.number.int();

    expect(one.number.int()).toBe(expected[1]);
  });

  it("repeats itself for the same seed", async () => {
    const first = await seededFaker(ONE);
    const second = await seededFaker(ONE);

    expect(first.number.int()).toBe(second.number.int());
  });
});
