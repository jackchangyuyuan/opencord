import { REACTION_EMOJI } from "@opencord/shared/constants";
import { describe, expect, it } from "vitest";

import { createRandom } from "../../modules/demo/corpus.js";
import type { SeededUser } from "../../modules/demo/provision.js";
import { PIN_LIMIT } from "../../modules/messages/pins/queries.js";
import {
  type DensityRow,
  planDensity,
  planEdits,
  planPins,
  planReactions,
  planReplies,
} from "./density.js";

const START = Date.UTC(2026, 0, 1);

function rows(count: number): DensityRow[] {
  return Array.from({ length: count }, (_ignored, index) => ({
    id: `00000000-0000-7000-8000-${String(index).padStart(12, "0")}`,
    authorId: `user-${String(index % 7)}`,
    createdAt: new Date(START + index * 60 * 1000),
  }));
}

function people(count: number): SeededUser[] {
  return Array.from({ length: count }, (_ignored, index) => ({
    id: `person-${String(index)}`,
    name: `Person ${String(index)}`,
    username: `seed-person-${String(index)}`,
    email: `seed-person-${String(index)}@seed.invalid`,
    image: `https://seed.invalid/${String(index)}.jpg`,
    description: null,
    customStatus: null,
    customStatusEmoji: null,
  }));
}

describe("the seeded reply density", () => {
  it("always quotes an earlier message from the same list", () => {
    const list = rows(200);
    const position = new Map(list.map((row, index) => [row.id, index]));

    const plans = planReplies(list, createRandom(11));

    expect(plans.length).toBeGreaterThan(0);

    for (const plan of plans) {
      const from = position.get(plan.id);
      const to = position.get(plan.replyToId);

      expect(from).toBeDefined();
      expect(to).toBeDefined();
      expect(to ?? 0).toBeLessThan(from ?? 0);
    }
  });

  it("never quotes the first message of the window from itself", () => {
    for (const plan of planReplies(rows(50), createRandom(3))) {
      expect(plan.id).not.toBe(plan.replyToId);
    }
  });
});

describe("the seeded edit density", () => {
  it("stamps an edit after the message it edits", () => {
    const list = rows(300);
    const at = new Map(list.map((row) => [row.id, row.createdAt.getTime()]));

    const plans = planEdits(list, createRandom(5));

    expect(plans.length).toBeGreaterThan(0);

    for (const plan of plans) {
      expect(plan.editedAt.getTime()).toBeGreaterThan(at.get(plan.id) ?? 0);
    }
  });
});

describe("the seeded pin density", () => {
  it("stays far below the cap and pins each message once", () => {
    const plans = planPins(rows(400), people(4), createRandom(9));

    expect(plans.length).toBeGreaterThan(0);
    expect(plans.length).toBeLessThan(PIN_LIMIT);
    expect(new Set(plans.map((plan) => plan.id)).size).toBe(plans.length);
  });

  it("pins only as a moderator, and not at all without one", () => {
    const moderators = people(4);
    const ids = new Set(moderators.map((person) => person.id));

    for (const plan of planPins(rows(400), moderators, createRandom(9))) {
      expect(ids.has(plan.pinnedBy)).toBe(true);
    }

    expect(planPins(rows(400), [], createRandom(9))).toEqual([]);
  });
});

describe("the seeded reaction density", () => {
  it("writes no duplicate of the reaction primary key", () => {
    const plans = planReactions(rows(400), people(30), createRandom(21));

    expect(plans.length).toBeGreaterThan(0);

    const keys = plans.map(
      (plan) => `${plan.messageId}:${plan.userId}:${plan.emoji}`,
    );

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("reacts only with the curated set", () => {
    for (const plan of planReactions(rows(200), people(30), createRandom(4))) {
      expect(REACTION_EMOJI).toContain(plan.emoji);
    }
  });
});

describe("the density pass as a whole", () => {
  it("is reproducible from its seed", () => {
    const list = rows(300);
    const crowd = people(30);
    const moderators = crowd.slice(0, 4);

    expect(planDensity(list, crowd, moderators, createRandom(77))).toEqual(
      planDensity(list, crowd, moderators, createRandom(77)),
    );
  });
});
