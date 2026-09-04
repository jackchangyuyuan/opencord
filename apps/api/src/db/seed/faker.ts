import type { Faker } from "@faker-js/faker";

// Deferred, so the generator stays on the seed path and never enters the API
// server's module graph, and a fresh instance every time: the package-level
// `faker` is shared, so seeding it here would leave every other generator
// drawing from a sequence this one had already moved on.
export async function seededFaker(seed: number): Promise<Faker> {
  const { Faker, en } = await import("@faker-js/faker");

  return new Faker({ locale: en, seed });
}
