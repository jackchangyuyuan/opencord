import { usernameSchema } from "@opencord/shared/schemas";
import { describe, expect, it } from "vitest";

import { personasFor, SEED_USERNAME_PREFIX } from "./personas.js";

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

  it("keeps usernames and addresses unique however Faker repeats a name", async () => {
    const personas = await personasFor(150);

    expect(new Set(personas.map((persona) => persona.username)).size).toBe(
      personas.length,
    );
    expect(new Set(personas.map((persona) => persona.email)).size).toBe(
      personas.length,
    );
  });

  it("gives every persona a name and a portrait", async () => {
    for (const persona of await personasFor(40)) {
      expect(persona.name).toMatch(/^\S+ \S+$/);
      expect(persona.image).toMatch(/^https:\/\/\S+\.jpg$/);
    }
  });
});
