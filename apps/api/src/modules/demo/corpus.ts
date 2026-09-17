export interface Random {
  next: () => number;
  pick: <T>(values: readonly T[]) => T;
  int: (max: number) => number;
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (max: number): number => Math.floor(next() * max);

  function pick<T>(values: readonly T[]): T {
    const value = values[int(values.length)];

    if (value === undefined) {
      throw new Error("cannot pick from an empty list");
    }

    return value;
  }

  return { next, pick, int };
}

export interface Topic {
  channel: string;
  subjects: string[];
  verbs: string[];
  objects: string[];
  asides: string[];
}

export const TOPICS: Topic[] = [
  {
    channel: "general",
    subjects: ["the release", "the changelog", "the roadmap", "this week"],
    verbs: [
      "looks good to me",
      "slipped a day",
      "is ready to ship",
      "needs one more pass",
    ],
    objects: [
      "after the migration lands",
      "once the docs catch up",
      "if nothing else breaks",
    ],
    asides: [
      "Anyone else seeing that?",
      "Happy to pair on it.",
      "Numbers below.",
    ],
  },
  {
    channel: "engineering",
    subjects: [
      "the keyset cursor",
      "the permission resolver",
      "the socket adapter",
      "the migration runner",
      "the presigned upload",
    ],
    verbs: [
      "drops from 240ms to 9ms",
      "is doing a sequential scan",
      "keeps the invariant",
      "needs the composite index",
      "fans out per instance",
    ],
    objects: [
      "on the partial index",
      "under READ COMMITTED",
      "across both containers",
      "inside one transaction",
      "before the transaction opens",
    ],
    asides: [
      "EXPLAIN ANALYZE is in the thread.",
      "I will write the regression test.",
      "This is the third time we have hit that.",
    ],
  },
  {
    channel: "design",
    subjects: [
      "the sidebar",
      "the composer",
      "the member list",
      "the empty state",
    ],
    verbs: [
      "reads better left-aligned",
      "wants more contrast",
      "collapses badly at 320px",
    ],
    objects: [
      "in the dark theme",
      "with a long channel name",
      "on a touch target",
    ],
    asides: [
      "Mock attached.",
      "Two options, no strong preference.",
      "Ship the simpler one.",
    ],
  },
  {
    channel: "random",
    subjects: [
      "the office kettle",
      "Friday",
      "the standing desk",
      "my keyboard",
    ],
    verbs: [
      "has opinions",
      "arrived early",
      "is finally quiet",
      "needs replacing",
    ],
    objects: ["for the third week running", "somehow", "against all advice"],
    asides: [
      "No further questions.",
      "Photographic evidence pending.",
      "I stand by this.",
    ],
  },
  {
    channel: "support",
    subjects: [
      "a customer",
      "the status page",
      "the retry queue",
      "an old client",
    ],
    verbs: [
      "reports a 409",
      "went green again",
      "drained overnight",
      "sends a stale nonce",
    ],
    objects: ["only on reconnect", "since the deploy", "in one region"],
    asides: [
      "Ticket linked.",
      "Reproduced locally.",
      "Closing unless it recurs.",
    ],
  },
];

const DEFAULT_TOPIC = TOPICS[0];

export function topicFor(channel: string): Topic {
  const topic =
    TOPICS.find((candidate) => candidate.channel === channel) ?? DEFAULT_TOPIC;

  if (topic === undefined) {
    throw new Error("the topic table is empty");
  }

  return topic;
}

export function sentence(random: Random, topic: Topic): string {
  const head = `${random.pick(topic.subjects)} ${random.pick(topic.verbs)} ${random.pick(topic.objects)}`;

  return random.next() < 0.35
    ? `${head}. ${random.pick(topic.asides)}`
    : `${head}.`;
}

export function messageBody(random: Random, topic: Topic): string {
  const lines = 1 + random.int(random.next() < 0.15 ? 3 : 1);

  return Array.from({ length: lines }, () => sentence(random, topic)).join(" ");
}

export function timeline(
  count: number,
  startMs: number,
  endMs: number,
  random?: Random,
): number[] {
  if (count <= 0) {
    return [];
  }

  const span = Math.max(endMs - startMs, count);
  const step = span / count;
  const stamps: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const jitter = random === undefined ? 0 : random.next() * step * 0.9;
    const at = Math.round(startMs + step * index + jitter);
    const previous = stamps[index - 1];

    stamps.push(previous === undefined ? at : Math.max(at, previous + 1));
  }

  return stamps;
}
