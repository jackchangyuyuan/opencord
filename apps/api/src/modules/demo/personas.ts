import type { Faker } from "@faker-js/faker";
import { USERNAME_MAX_LENGTH } from "@opencord/shared/constants";

import { SEED_USERNAME_PREFIX } from "./dataset.js";
import { seededFaker } from "./faker.js";

const PERSONA_SEED = 20260913;

const PORTRAIT_SIZE = 128;

export interface Persona {
  username: string;
  name: string;
  email: string;
  image: string;
  description: string | null;
  customStatus: string | null;
  customStatusEmoji: string | null;
}

// Two of the cast are fixed rather than drawn: the interface has to survive a
// display name longer than the space it is given, and two people who share one.
const LONG_NAME_INDEX = 11;
const LONG_NAME = ["Maximiliana", "Featherstonehaugh-Wentworth"] as const;
const DUPLICATED_NAME_INDEX = 7;
const DUPLICATE_SOURCE_INDEX = 3;

// Curated rather than generated: these carry the product's own voice, and
// Faker's generic corpora would read as filler beside the seeded conversations.
const SCHOOLS = [
  "Waterloo",
  "UBC",
  "McGill",
  "Toronto",
  "Imperial",
  "ETH Zürich",
  "Georgia Tech",
];

const FIELDS = [
  "distributed systems",
  "compilers",
  "query planners",
  "type systems",
  "observability",
  "storage engines",
  "replication",
];

const STACK = [
  "TypeScript",
  "Postgres",
  "Rust",
  "Go",
  "Elixir",
  "Python",
  "Kotlin",
];

interface Draw {
  one: <T>(values: readonly T[]) => T;
  two: <T>(values: readonly T[]) => [T, T];
}

const DESCRIPTIONS: ((draw: Draw) => string)[] = [
  ({ one }) => `Computer Science @ ${one(SCHOOLS)}`,
  ({ one }) => `Building ${one(FIELDS)} and occasionally breaking them.`,
  ({ two }) => {
    const [first, second] = two(STACK);

    return `Full-stack developer · ${first} · ${second}`;
  },
  ({ one }) => `Mostly ${one(FIELDS)}. Ask me about ${one(STACK)}.`,
  ({ one }) => `${one(STACK)} by day. ${one(FIELDS)} by night.`,
  ({ one }) =>
    `Platform team.\n\nCurrently: ${one(FIELDS)}, with far too much ${one(STACK)}.`,
];

const STATUSES: { text: string; emoji: string | null }[] = [
  { text: "shipping bugs", emoji: "🐛" },
  { text: "working on auth", emoji: "🔒" },
  { text: "in class", emoji: "📚" },
  { text: "reviewing PRs", emoji: "👀" },
  { text: "coffee first", emoji: "☕" },
  { text: "heads down", emoji: "🎧" },
  { text: "on call", emoji: "📟" },
  { text: "deep in a migration", emoji: "🛠️" },
  { text: "back in ten", emoji: null },
  { text: "pairing all afternoon", emoji: "🤝" },
  { text: "writing the tests I promised", emoji: null },
  { text: "out for lunch", emoji: "🥪" },
  { text: "in a meeting", emoji: "📅" },
  { text: "grabbing lunch", emoji: "🍕" },
  { text: "listening to something loud", emoji: "🎵" },
  { text: "back soon", emoji: null },
  { text: "shipping something", emoji: "🚀" },
  { text: "reading the spec, finally", emoji: "📖" },
  { text: "chasing a flaky test", emoji: "🎲" },
  { text: "on the whiteboard", emoji: "🧠" },
  { text: "interviewing this morning", emoji: "🤝" },
  { text: "away from keyboard", emoji: null },
  { text: "rebasing, wish me luck", emoji: "🌿" },
  { text: "watching the dashboards", emoji: "📈" },
];

const DESCRIBED_SHARE = 0.65;

const STATUS_SHARE = 0.74;
const STATUS_EMOJI_SHARE = 0.8;

interface PersonaProfile {
  description: string | null;
  customStatus: string | null;
  customStatusEmoji: string | null;
}

function drawFrom(faker: Faker): Draw {
  return {
    one: <T>(values: readonly T[]): T => faker.helpers.arrayElement(values),
    two: <T>(values: readonly T[]): [T, T] => {
      const [one, other] = faker.helpers.arrayElements(values, 2);

      if (one === undefined || other === undefined) {
        throw new Error("a description list needs two entries");
      }

      return [one, other];
    },
  };
}

function profileFor(faker: Faker, draw: Draw): PersonaProfile {
  const described = faker.number.float() < DESCRIBED_SHARE;
  const announced = faker.number.float() < STATUS_SHARE;
  const status = draw.one(STATUSES);

  return {
    description: described ? draw.one(DESCRIPTIONS)(draw) : null,
    customStatus: announced ? status.text : null,
    customStatusEmoji:
      announced && faker.number.float() < STATUS_EMOJI_SHARE
        ? status.emoji
        : null,
  };
}

// The handle Faker suggests carries the prefix the demo reserves for its own
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
  const draw = drawFrom(faker);

  const drawn = Array.from({ length: count }, () => ({
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
  }));

  return drawn.map((entry, index) => {
    const source = drawn[DUPLICATE_SOURCE_INDEX];

    const [firstName, lastName] =
      index === LONG_NAME_INDEX
        ? LONG_NAME
        : index === DUPLICATED_NAME_INDEX && source !== undefined
          ? [source.firstName, source.lastName]
          : [entry.firstName, entry.lastName];

    const username = usernameFor(faker, firstName, lastName, index);

    return {
      username,
      name: `${firstName} ${lastName}`,
      // .invalid can never route mail (RFC 2606), and the address inherits the
      // username's uniqueness, which users.email requires.
      email: `${username}@seed.invalid`,
      // users.image is the column that carries an external portrait (SPEC
      // 11.5), and Faker serves these from jsDelivr, which is why the
      // production img-src names that host beside the two OAuth avatar hosts.
      image: faker.image.personPortrait({ size: PORTRAIT_SIZE }),
      ...profileFor(faker, draw),
    };
  });
}
