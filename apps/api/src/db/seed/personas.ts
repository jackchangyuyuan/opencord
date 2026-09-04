import type { Faker } from "@faker-js/faker";
import { USERNAME_MAX_LENGTH } from "@opencord/shared/constants";

import { seededFaker } from "./faker.js";

const PERSONA_SEED = 20260913;

const PORTRAIT_SIZE = 128;

export interface Persona {
  username: string;
  name: string;
  email: string;
  image: string;
}

export const SEED_USERNAME_PREFIX = "seed-";

// The handle Faker suggests carries the prefix the seed reserves for its own
// cast, loses whatever the column will not accept, and ends in the persona's
// place in the cast so two people who share a name still get their own.
function usernameFor(
  faker: Faker,
  firstName: string,
  lastName: string,
  index: number,
): string {
  const suffix = `-${String(index)}`;

  const stem =
    `${SEED_USERNAME_PREFIX}${faker.internet.username({ firstName, lastName })}`
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .slice(0, USERNAME_MAX_LENGTH - suffix.length)
      .replace(/-+$/, "");

  return `${stem}${suffix}`;
}

export async function personasFor(count: number): Promise<Persona[]> {
  const faker = await seededFaker(PERSONA_SEED);

  return Array.from({ length: count }, (_unused, index) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const username = usernameFor(faker, firstName, lastName, index);

    return {
      username,
      name: `${firstName} ${lastName}`,
      // .invalid can never route mail (RFC 2606), and the address inherits the
      // username's uniqueness, which users.email requires.
      email: `${username}@seed.invalid`,
      // users.image is the column that carries an external portrait, and Faker
      // serves these from jsDelivr.
      image: faker.image.personPortrait({ size: PORTRAIT_SIZE }),
    };
  });
}
