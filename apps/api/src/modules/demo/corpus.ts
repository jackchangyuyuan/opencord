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
  {
    channel: "releases",
    subjects: ["4.2.1", "the canary", "the changelog", "the rollout"],
    verbs: [
      "is flat on the canary",
      "went out this morning",
      "is held for one more fix",
      "reached everyone",
    ],
    objects: [
      "with no error-rate change",
      "an hour behind schedule",
      "once the migration drained",
    ],
    asides: [
      "Changelog is two lines.",
      "Nothing to do unless it moves.",
      "Rolling forward.",
    ],
  },
  {
    channel: "incidents",
    subjects: [
      "latency on the query path",
      "the connection pool",
      "the readiness probe",
      "the retry queue",
    ],
    verbs: [
      "recovered on its own",
      "climbed for six minutes",
      "went green again",
      "is back to baseline",
    ],
    objects: [
      "in one region only",
      "without serving an error",
      "after the rollback landed",
    ],
    asides: [
      "Timeline in the thread.",
      "No data loss.",
      "Postmortem tomorrow.",
    ],
  },
  {
    channel: "postmortems",
    subjects: [
      "the write-up",
      "the timeline",
      "the action items",
      "the contributing cause",
    ],
    verbs: [
      "is ready for review",
      "needs one more pass",
      "landed shorter than expected",
    ],
    objects: [
      "now that the graphs are attached",
      "before Thursday's review",
      "with the detection gap called out",
    ],
    asides: [
      "No blame, as ever.",
      "Two action items, both small.",
      "Comments welcome.",
    ],
  },
  {
    channel: "oncall",
    subjects: [
      "the handover",
      "this week's rotation",
      "the pager",
      "the runbook",
    ],
    verbs: [
      "is quiet so far",
      "swaps at 09:00",
      "needs an owner",
      "is finally accurate",
    ],
    objects: [
      "for the second week running",
      "after the alert cleanup",
      "apart from one flap",
    ],
    asides: [
      "Nothing overnight.",
      "Ping me if it gets loud.",
      "Handover notes are in the doc.",
    ],
  },
  {
    channel: "tooling",
    subjects: [
      "the CI cache",
      "the formatter",
      "the local stack",
      "the test harness",
    ],
    verbs: [
      "cuts the run in half",
      "disagrees with the editor",
      "comes up in nine seconds",
      "is flaky under load",
    ],
    objects: [
      "once the key includes the lockfile",
      "on a cold clone",
      "in the container but not locally",
    ],
    asides: [
      "Config is in the PR.",
      "Worth stealing for the other repo.",
      "I will document it properly.",
    ],
  },
  {
    channel: "courses",
    subjects: [
      "the assignment",
      "the lecture notes",
      "the midterm",
      "the study group",
    ],
    verbs: [
      "is heavier than the outline suggested",
      "covers more than the slides",
      "moved to Thursday",
    ],
    objects: [
      "if you start early",
      "once you read the harness",
      "which nobody mentioned",
    ],
    asides: [
      "Notes are shared.",
      "Office hours help.",
      "Start the tests first.",
    ],
  },
  {
    channel: "internships",
    subjects: [
      "the loop",
      "the take-home",
      "the systems round",
      "the recruiter",
    ],
    verbs: [
      "was shorter than expected",
      "is a real repo now",
      "came back within a week",
    ],
    objects: [
      "with the tests already failing",
      "after two follow-ups",
      "for a summer start",
    ],
    asides: [
      "Happy to share notes.",
      "Ask about the team, not the stack.",
      "It gets easier.",
    ],
  },
  {
    channel: "projects",
    subjects: [
      "the side project",
      "the parser",
      "the little CLI",
      "the weekend rewrite",
    ],
    verbs: [
      "finally does the thing",
      "is slower than the shell script",
      "has tests now",
    ],
    objects: [
      "after three evenings",
      "which was the whole point",
      "and I regret the name",
    ],
    asides: ["Repo is public.", "Feedback welcome.", "It is 200 lines."],
  },
  {
    channel: "hardware",
    subjects: ["the mini PC", "the drive array", "the fan curve", "the UPS"],
    verbs: [
      "idles lower than the old one",
      "is louder than advertised",
      "paid for itself",
    ],
    objects: [
      "at the wall, not the BMC",
      "under sustained load",
      "after the firmware update",
    ],
    asides: ["Photos in the thread.", "Second-hand, obviously.", "No regrets."],
  },
  {
    channel: "networking",
    subjects: [
      "the VLAN split",
      "the reverse proxy",
      "the DNS rewrite",
      "the wireguard tunnel",
    ],
    verbs: [
      "stopped the broadcast noise",
      "survives a reboot now",
      "is doing what I asked",
    ],
    objects: [
      "once the firewall rules matched",
      "on the second attempt",
      "without a static route",
    ],
    asides: [
      "Config is sanitised in the thread.",
      "Took an evening.",
      "Would do it again.",
    ],
  },
  {
    channel: "self-hosting",
    subjects: [
      "the backup job",
      "the restore test",
      "the container stack",
      "the certificate renewal",
    ],
    verbs: [
      "ran clean overnight",
      "failed the first time",
      "renews unattended now",
    ],
    objects: [
      "into a scratch database",
      "after the extension was written down",
      "since the cron moved",
    ],
    asides: [
      "Test your restores.",
      "Less exciting is the goal.",
      "Documented this time.",
    ],
  },
  {
    channel: "deals",
    subjects: [
      "the refurbished drives",
      "that switch",
      "the rack shelf",
      "the spare PSU",
    ],
    verbs: ["dropped again", "is back in stock", "is cheaper used"],
    objects: [
      "if you can wait for shipping",
      "with three years on the counter",
      "in the usual place",
    ],
    asides: ["Not affiliated.", "I bought two.", "Check the SMART hours."],
  },
  {
    channel: "music",
    subjects: [
      "the focus playlist",
      "that album",
      "the new record",
      "this track",
    ],
    verbs: [
      "carried me through the migration",
      "is better than the single suggested",
      "loops well",
    ],
    objects: [
      "without lyrics, which matters",
      "on the commute",
      "at a sensible volume",
    ],
    asides: ["Link in the thread.", "Open to suggestions.", "No skips."],
  },
  {
    channel: "food",
    subjects: [
      "the lunch place",
      "that recipe",
      "the coffee downstairs",
      "Friday's order",
    ],
    verbs: [
      "is worth the walk",
      "worked on the second attempt",
      "improved dramatically",
    ],
    objects: [
      "if you go before noon",
      "with half the salt",
      "since they changed beans",
    ],
    asides: ["Recommended.", "I will bring some in.", "Photos, obviously."],
  },
  {
    channel: "pets",
    subjects: [
      "the cat",
      "the new puppy",
      "the office dog",
      "my landlord's cat",
    ],
    verbs: [
      "has claimed the keyboard",
      "slept through the whole call",
      "supervises every deploy",
    ],
    objects: [
      "as is traditional",
      "on the warmest machine in the flat",
      "without being asked",
    ],
    asides: [
      "Photographic evidence attached.",
      "No notes.",
      "She is in charge now.",
    ],
  },
  {
    channel: "introductions",
    subjects: [
      "This place",
      "The community here",
      "The write-up on the planner",
      "The thread on keyset pagination",
      "A colleague's recommendation",
    ],
    verbs: [
      "came up in a search",
      "is friendlier than I expected",
      "is more active than I expected",
      "is what convinced me to join",
      "has been useful already",
    ],
    objects: [
      "so I am mostly here to read",
      "which is a nice change",
      "and I am glad I found it",
      "after a few weeks of lurking",
      "though I have not posted until now",
    ],
    asides: [
      "Happy to help where I can.",
      "Say hello if we overlap.",
      "Still finding my way around.",
      "Mostly interested in the storage side.",
    ],
  },
  {
    channel: "announcements",
    subjects: [
      "the next release",
      "the maintenance window",
      "the new #incidents channel",
      "the office move",
      "the on-call rotation",
      "the quarterly review",
      "the new starter guide",
      "the status page",
    ],
    verbs: [
      "is scheduled for Friday",
      "lands on Tuesday",
      "is open now",
      "has moved to the docs",
      "closes at the end of the week",
      "is paused until the migration finishes",
    ],
    objects: [
      "with no expected downtime",
      "for about twenty minutes",
      "and is pinned above",
      "for everyone in the release crew",
      "from 09:00 UTC",
      "until further notice",
    ],
    asides: [
      "Read the changelog.",
      "No action needed.",
      "Questions in the thread.",
      "Nothing breaks if you ignore this.",
      "Shout if that does not work for you.",
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
  return draw(random, topic).text;
}

interface Drawn {
  text: string;
  parts: string[];
}

function draw(random: Random, topic: Topic): Drawn {
  const subject = random.pick(topic.subjects);
  const verb = random.pick(topic.verbs);
  const object = random.pick(topic.objects);
  const head = `${subject} ${verb} ${object}`;

  const text =
    random.next() < 0.35 ? `${head}. ${random.pick(topic.asides)}` : `${head}.`;

  return { text, parts: [subject, verb, object] };
}

// A backlog of bare sentences reads like generated text however good the
// sentences are, because real channels are not uniform: some messages carry a
// snippet, a link, a list or an emphasis, and most carry none of it. These
// shares are deliberately low -- markdown everywhere is as unconvincing as
// markdown nowhere.
const SNIPPETS = [
  "select count(*) from messages\n where channel_id = $1 and deleted_at is null;",
  "const plan = compile([...this.#scopes, ...this.#steps]);",
  "docker compose --profile full up -d --wait",
  "explain analyze select id from events\n order by id desc limit 50;",
  "await Promise.all(peers.map((peer) => peer.converge()));",
  "pg_dump --no-owner | gzip -9 | aws s3 cp - s3://$BUCKET/$KEY",
];

const TERMS = [
  "deleted_at",
  "READ COMMITTED",
  "uuidv7()",
  "SIGTERM",
  "/readyz",
  "proxy_next_upstream",
  "content-length-range",
];

const LINKS = [
  "https://www.postgresql.org/docs/18/indexes-partial.html",
  "https://github.com/meridian-dev/meridian/pull/1842",
  "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy",
  "https://socket.io/docs/v4/redis-adapter/",
];

const LIST_TAILS = [
  "still needs checking",
  "is covered by the new test",
  "only matters under load",
  "is unchanged",
];

const RECENT_PARTS = 9;

const SNIPPET_SHARE = 0.05;
const LINK_SHARE = 0.07;
const TERM_SHARE = 0.16;
const LIST_SHARE = 0.04;
const EMPHASIS_SHARE = 0.06;

function decorate(random: Random, body: string): string {
  if (random.next() < SNIPPET_SHARE) {
    const language = random.pick(["ts", "sql", "bash"]);

    return `${body}\n\n\`\`\`${language}\n${random.pick(SNIPPETS)}\n\`\`\``;
  }

  if (random.next() < LIST_SHARE) {
    const items = 2 + random.int(2);
    // Distinct terms: picking with replacement puts the same line in a list
    // twice, which is the tell that nobody wrote it.
    const chosen: string[] = [];

    while (chosen.length < items && chosen.length < TERMS.length) {
      const term = random.pick(TERMS);

      if (!chosen.includes(term)) {
        chosen.push(term);
      }
    }

    const bullets = chosen
      .map(
        (term, index) =>
          `- \`${term}\` ${LIST_TAILS[index % LIST_TAILS.length] ?? "still needs checking"}`,
      )
      .join("\n");

    return `${body}\n\n${bullets}`;
  }

  if (random.next() < LINK_SHARE) {
    return `${body} ${random.pick(LINKS)}`;
  }

  if (random.next() < TERM_SHARE) {
    return `${body} Worth checking \`${random.pick(TERMS)}\` first.`;
  }

  if (random.next() < EMPHASIS_SHARE) {
    return `${body} **Not urgent.**`;
  }

  return body;
}

// A topic is a finite combinatorial space, so a long channel will draw the same
// sentence twice. Remembering what a channel has already said and resampling is
// what keeps a quiet channel from reading like a stuck record.
export function messageBody(
  random: Random,
  topic: Topic,
  recent?: string[],
): string {
  const lines = 1 + random.int(random.next() < 0.15 ? 3 : 1);

  const body = Array.from({ length: lines }, () => {
    let drawn = draw(random, topic);

    // Whole-sentence dedupe is not enough: a topic has few objects, so four
    // messages in a row can end "...and I am glad I did" while every sentence
    // is technically distinct. Re-roll when a phrase was used very recently.
    for (
      let tries = 0;
      recent !== undefined &&
      drawn.parts.some((part) => recent.includes(part)) &&
      tries < 10;
      tries += 1
    ) {
      drawn = draw(random, topic);
    }

    if (recent !== undefined) {
      recent.push(...drawn.parts);

      // Only the last few messages matter; an unbounded history would exhaust
      // the topic and re-roll forever.
      while (recent.length > RECENT_PARTS) {
        recent.shift();
      }
    }

    return drawn.text;
  }).join(" ");

  return decorate(random, body);
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
