import {
  customStatusEmojiSchema,
  customStatusSchema,
  descriptionSchema,
  usernameSchema,
} from "@opencord/shared/schemas";
import { describe, expect, it } from "vitest";

import { SEED_USERNAME_PREFIX } from "./dataset.js";
import { personasFor } from "./personas.js";

describe("the seed personas", () => {
  it("is reproducible from its seed", async () => {
    expect(await personasFor(30)).toEqual(await personasFor(30));
  });

  it("mints usernames the shared schema accepts", async () => {
    for (const persona of await personasFor(120)) {
      expect(usernameSchema.parse(persona.username)).toBe(persona.username);
      expect(persona.username.startsWith(SEED_USERNAME_PREFIX)).toBe(true);
    }
  });

  it("keeps usernames and addresses unique however often a surname repeats", async () => {
    const personas = await personasFor(150);

    expect(new Set(personas.map((persona) => persona.username)).size).toBe(
      personas.length,
    );
    expect(new Set(personas.map((persona) => persona.email)).size).toBe(
      personas.length,
    );
  });

  it("gives every persona a portrait the content policy allows", async () => {
    for (const persona of await personasFor(120)) {
      const portrait = new URL(persona.image);

      expect(portrait.origin).toBe("https://cdn.jsdelivr.net");
      expect(portrait.pathname).toMatch(
        /^\/gh\/faker-js\/assets-person-portrait\/[a-z]+\/128\/\d+\.jpg$/,
      );
    }
  });

  it("draws portraits that vary across the cast", async () => {
    const personas = await personasFor(120);

    expect(
      new Set(personas.map((persona) => persona.image)).size,
    ).toBeGreaterThan(personas.length / 2);
  });

  it("gives every persona a two-part display name", async () => {
    for (const persona of await personasFor(40)) {
      expect(persona.name).toMatch(/^\S+ \S+$/);
    }
  });

  it("writes profiles the shared schema would accept", async () => {
    const personas = await personasFor(120);
    const refused = personas.filter(
      (persona) =>
        !descriptionSchema.nullable().safeParse(persona.description).success ||
        !customStatusSchema.nullable().safeParse(persona.customStatus)
          .success ||
        !customStatusEmojiSchema.nullable().safeParse(persona.customStatusEmoji)
          .success,
    );

    expect(refused).toEqual([]);
  });

  it("leaves a believable share of the cast blank", async () => {
    const personas = await personasFor(120);

    const described = personas.filter(
      (persona) => persona.description !== null,
    );
    const announced = personas.filter(
      (persona) => persona.customStatus !== null,
    );

    expect(described.length).toBeGreaterThan(20);
    expect(described.length).toBeLessThan(personas.length - 20);
    expect(announced.length).toBeGreaterThan(20);
    expect(announced.length).toBeLessThan(personas.length - 20);
    expect(
      announced.filter((persona) => persona.customStatusEmoji === null).length,
    ).toBeGreaterThan(0);
  });

  it("carries at least one multiline description", async () => {
    const personas = await personasFor(120);

    expect(
      personas.some((persona) => persona.description?.includes("\n") === true),
    ).toBe(true);
  });

  it("repeats one display name and lengthens another, on purpose", async () => {
    const personas = await personasFor(40);
    const names = personas.map((persona) => persona.name);
    const duplicated = names.filter(
      (name, index) => names.indexOf(name) !== index,
    );

    expect(duplicated.length).toBeGreaterThan(0);
    expect(Math.max(...names.map((name) => name.length))).toBeGreaterThan(30);

    expect(new Set(personas.map((persona) => persona.username)).size).toBe(
      personas.length,
    );
  });
});
