import type { Faker } from "@faker-js/faker";

// Deferred, and the only place the demo module reaches for Faker, so the
// generator stays on the seed and bootstrap paths and never enters the API
// server's module graph. The instance is local and takes its seed through the
// constructor, so nothing shares or mutates Faker's global state.
export async function seededFaker(seed: number): Promise<Faker> {
  const { Faker, en } = await import("@faker-js/faker");

  return new Faker({ locale: en, seed });
}
