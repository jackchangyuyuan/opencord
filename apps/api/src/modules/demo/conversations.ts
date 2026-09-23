// Hand-authored exchanges. The generated backlog in corpus.ts gives the
// channels depth; these give the newest screenful something worth reading,
// which is the part anyone opening the demo actually sees.
//
// A beat names its speaker by slot rather than by person, so one exchange can
// be cast from whichever members a channel happens to have and the same people
// still carry the whole conversation. `{0}` interpolates a mention of the slot
// that number names, and is rewritten to the stored `<@id>` form at insert.

export interface Beat {
  speaker: number;
  text: string;
  // Index of an earlier beat in the same exchange.
  replyTo?: number;
  pinned?: boolean;
  edited?: boolean;
  // Minutes after the previous beat; absent means a short conversational gap.
  gap?: number;
}

export interface Exchange {
  theme: string;
  cast: number;
  beats: Beat[];
}

export const EXCHANGES: Exchange[] = [
  {
    theme: "engineering",
    cast: 4,
    beats: [
      {
        speaker: 0,
        text: "Found it. `withTenant()` stops composing once the builder goes lazy, so the tenant predicate never reaches the plan and every read is a sequential scan over `events`.",
      },
      {
        speaker: 1,
        text: "That would explain the p99. How far back does it go?",
      },
      {
        speaker: 0,
        text: "Every build since 4.2.0. It only shows up once a tenant has enough rows to matter, which is why staging never caught it.",
        replyTo: 1,
      },
      {
        speaker: 2,
        text: "That one is mine, from the planner refactor. The scopes have to be folded in before the builder freezes:\n\n```ts\n- const plan = compile(this.#steps);\n+ const plan = compile([...this.#scopes, ...this.#steps]);\n```",
        pinned: true,
      },
      {
        speaker: 2,
        text: "Patch, and a regression test that fails on the 4.2.0 build: https://github.com/meridian-dev/meridian/pull/1842",
      },
      {
        speaker: 3,
        text: "Do we roll forward or pull 4.2? The adapter flag is off for everyone, so pulling it is the boring option if anyone wants it.",
        gap: 6,
      },
      {
        speaker: 1,
        text: "Forward. It is a two-line patch, and a rollback takes the cursor fix out with it.",
        replyTo: 5,
        edited: true,
      },
      {
        speaker: 0,
        text: "Approved. The regression test is the part I care about — that is twice now.",
      },
      {
        speaker: 3,
        text: "Worth a line in the perf checklist? {0} has opinions about where it should live.",
        replyTo: 7,
        gap: 4,
      },
    ],
  },
  {
    theme: "engineering",
    cast: 3,
    beats: [
      {
        speaker: 0,
        text: "The keyset cursor is doing a backwards scan twice on the `around=` path. Once to find the anchor, once to fill the page above it.",
      },
      {
        speaker: 1,
        text: "Is that measurable, or is it just offensive to look at?",
      },
      {
        speaker: 0,
        text: "Measurable on the busy channels. 240ms to 9ms once the partial index covers it:\n\n```sql\ncreate index concurrently messages_live_channel_id_idx\n    on messages (channel_id, id desc)\n where deleted_at is null;\n```",
        replyTo: 1,
        pinned: true,
      },
      {
        speaker: 2,
        text: "`concurrently` outside a transaction, so it cannot go in the migration runner as-is.",
      },
      {
        speaker: 0,
        text: "Right — it is expand-then-contract, so it ships in its own step ahead of the code that needs it.",
        replyTo: 3,
      },
      {
        speaker: 1,
        text: "EXPLAIN before and after is in the thread if anyone wants to check my arithmetic.",
        gap: 11,
      },
    ],
  },
  {
    theme: "general",
    cast: 4,
    beats: [
      {
        speaker: 0,
        text: "Morning. Standup in ten, and I will keep it short — most of it is in the changelog already.",
        gap: 40,
      },
      {
        speaker: 1,
        text: "Can we talk about the staging database? It has been three days since it matched production.",
      },
      {
        speaker: 0,
        text: "Yes. Short version: the nightly restore is timing out on the attachments table and giving up quietly.",
        replyTo: 1,
      },
      {
        speaker: 2,
        text: "Quietly is doing a lot of work in that sentence.",
        replyTo: 2,
      },
      {
        speaker: 0,
        text: "It is. There is now an alert, which is the only reason I know the number is three and not ten.",
        replyTo: 3,
        edited: true,
      },
      {
        speaker: 3,
        text: "I can take the restore if nobody has started. I owe this one a fix after the last migration.",
        gap: 7,
      },
      { speaker: 0, text: "All yours.", replyTo: 5 },
    ],
  },
  {
    theme: "design",
    cast: 3,
    beats: [
      {
        speaker: 0,
        text: "The composer's mention menu anchors to the caret, which reads fine until the caret is on the last line and the menu opens off-screen.",
      },
      {
        speaker: 1,
        text: "Flip it above the caret when there is not room below? That is what every editor does.",
      },
      {
        speaker: 0,
        text: "That is the plan. The part I am unsure about is what happens when there is not room either way, which is real on a short viewport.",
        replyTo: 1,
      },
      {
        speaker: 2,
        text: "Then it should take the space it has and scroll. A menu that overflows the viewport is worse than a short menu.",
        replyTo: 2,
        pinned: true,
      },
      {
        speaker: 1,
        text: "Agreed. Two options in the mock, no strong preference — I would ship the simpler one.",
        gap: 20,
      },
      {
        speaker: 0,
        text: "Simpler one it is. I will put the reduced-motion variant in the same PR so it does not get forgotten again.",
        replyTo: 4,
      },
    ],
  },
  {
    theme: "incidents",
    cast: 4,
    beats: [
      {
        speaker: 0,
        text: "Paging myself: p99 on `GET /v1/query` went from 41ms to 1.4s at 14:02. Error rate is flat, so this is slow, not broken.",
        pinned: true,
      },
      {
        speaker: 1,
        text: "Deploy at 13:58. That is close enough that I would start there.",
        replyTo: 0,
      },
      {
        speaker: 0,
        text: "Rolling back to 4.2.0 now. Will confirm in five.",
        replyTo: 1,
      },
      {
        speaker: 2,
        text: "Connection count is climbing too — 400 and rising. Could be the pool waiting on the slow query rather than a second problem.",
        gap: 4,
      },
      {
        speaker: 0,
        text: "Rollback is in. p99 back to 44ms, connections draining.",
        gap: 6,
      },
      {
        speaker: 3,
        text: "Confirmed from the dashboards. Calling it: 22 minutes, no data loss, no errors served.",
        replyTo: 4,
      },
      {
        speaker: 0,
        text: "Postmortem tomorrow. The interesting question is not the bug, it is why staging looked fine for six days.",
        gap: 15,
      },
    ],
  },
  {
    theme: "releases",
    cast: 3,
    beats: [
      {
        speaker: 0,
        text: "4.2.1 is on the canary for twenty minutes and p99 is back to 41ms.",
        pinned: true,
      },
      {
        speaker: 1,
        text: "Full rollout in half an hour if it stays flat?",
        replyTo: 0,
      },
      {
        speaker: 0,
        text: "That is the plan. I will put the write-up in {2} once it is everywhere.",
        replyTo: 1,
      },
      {
        speaker: 2,
        text: "Changelog is drafted. Two lines, which is the nicest changelog we have shipped in a while.",
        gap: 9,
      },
      {
        speaker: 0,
        text: "Everywhere. Closing the incident.",
        gap: 34,
        edited: true,
      },
    ],
  },
  {
    theme: "support",
    cast: 3,
    beats: [
      {
        speaker: 0,
        text: "Customer on the enterprise plan reports a 409 on every retry after a reconnect. Only one region, only since Tuesday.",
      },
      {
        speaker: 1,
        text: "409 on retry usually means the nonce is being reused after the client reconnects. Do we have a request id?",
        replyTo: 0,
      },
      {
        speaker: 0,
        text: "Two, in the ticket. Both show the same nonce twice, four seconds apart.",
        replyTo: 1,
      },
      {
        speaker: 1,
        text: "Then it is the client holding the nonce across the reconnect instead of minting a new one. That is ours — the SDK is supposed to clear it on disconnect.",
      },
      {
        speaker: 2,
        text: "Reproduced locally by killing the socket mid-send. Filing it against the SDK.",
        replyTo: 3,
        gap: 25,
      },
      {
        speaker: 0,
        text: "Replied to the customer with the workaround. Closing unless it recurs.",
        gap: 40,
      },
    ],
  },
  {
    theme: "random",
    cast: 4,
    beats: [
      {
        speaker: 0,
        text: "The office kettle has developed opinions. It now switches itself off at 94°C and refuses to discuss it.",
      },
      { speaker: 1, text: "94 is fine for green tea. The kettle is right." },
      {
        speaker: 2,
        text: "The kettle is not *right*, it is broken in a way that happens to suit you.",
        replyTo: 1,
      },
      {
        speaker: 1,
        text: "Those are the same thing if you stop asking questions.",
        replyTo: 2,
      },
      {
        speaker: 3,
        text: "Photographic evidence pending. I am told there is a sticker on it now.",
        gap: 30,
      },
      {
        speaker: 0,
        text: "There is a sticker on it now. It says 94. I stand by this.",
        replyTo: 4,
        gap: 55,
        pinned: true,
      },
    ],
  },
  {
    theme: "help",
    cast: 3,
    beats: [
      {
        speaker: 0,
        text: 'Stuck on a migration that works locally and fails in CI with `relation "channels" does not exist`. Same commit, same command.',
      },
      {
        speaker: 1,
        text: "Does CI run the migrations before the tests, or does it restore a dump?",
        replyTo: 0,
      },
      {
        speaker: 0,
        text: "Restores a dump. Which I am now realising is from before the table existed.",
        replyTo: 1,
      },
      {
        speaker: 1,
        text: "That is the one. The dump is a cache, and nothing invalidates it when a migration lands.",
      },
      {
        speaker: 2,
        text: "Key the cache on the migrations directory hash. Two lines in the workflow and it stops being a class of bug.",
        replyTo: 3,
        pinned: true,
      },
      {
        speaker: 0,
        text: "That worked. Thank you both — green on the first try.",
        gap: 18,
      },
    ],
  },
  {
    theme: "courses",
    cast: 4,
    beats: [
      {
        speaker: 0,
        text: "Anyone else taking the distributed systems course this term? The first assignment looks heavier than the outline suggested.",
      },
      {
        speaker: 1,
        text: "Taking it. The assignment is a Raft implementation with a test harness that kills your leader at the worst possible moment.",
        replyTo: 0,
      },
      {
        speaker: 2,
        text: "The harness is the whole course, honestly. Write the tests first or you will debug by print statement for a week.",
      },
      {
        speaker: 0,
        text: "Noted. Is the textbook worth buying or is it the lecture notes again?",
        replyTo: 2,
      },
      {
        speaker: 3,
        text: "Lecture notes. The textbook is good but it is not what you are assessed on.",
        replyTo: 3,
      },
      {
        speaker: 1,
        text: "Study group on Thursdays if you want in. We mostly argue about linearizability and then order food.",
        gap: 50,
      },
    ],
  },
  {
    theme: "internships",
    cast: 3,
    beats: [
      {
        speaker: 0,
        text: "Posting this here because it helped me: the interview loop is much less scary once you treat the systems round as a conversation instead of an exam.",
        pinned: true,
      },
      {
        speaker: 1,
        text: "Did you get asked to write real code, or was it whiteboard?",
        replyTo: 0,
      },
      {
        speaker: 0,
        text: "Real code, in a repo, with the tests already failing. Which I much preferred — you can read the code instead of guessing the constraints.",
        replyTo: 1,
      },
      {
        speaker: 2,
        text: "That is becoming more common. Two of the three I did last cycle were the same shape.",
      },
      {
        speaker: 1,
        text: "Good to know. Thanks for writing it up rather than just saying it went fine.",
        replyTo: 3,
        gap: 35,
      },
    ],
  },
  {
    theme: "hardware",
    cast: 3,
    beats: [
      {
        speaker: 0,
        text: "Picked up a second-hand mini PC for the rack. 6 cores, 64GB, and it idles at 11W, which is better than the NAS it is replacing.",
      },
      {
        speaker: 1,
        text: "11W measured at the wall, or from the BMC? Those disagree by a lot on that generation.",
        replyTo: 0,
      },
      {
        speaker: 0,
        text: "At the wall. The BMC claims 8, which I do not believe for a moment.",
        replyTo: 1,
      },
      {
        speaker: 2,
        text: "Nothing believes the BMC. What are you running on it?",
      },
      {
        speaker: 0,
        text: "Everything that used to be on the NAS, plus the things I kept saying I would self-host and never did.",
        replyTo: 3,
        edited: true,
      },
    ],
  },
  {
    theme: "self-hosting",
    cast: 3,
    beats: [
      {
        speaker: 0,
        text: "Finally moved off the hosted database. Backups are a `pg_dump` piped straight into object storage, which is far less exciting than what I had before.",
      },
      {
        speaker: 1,
        text: "Less exciting is the goal. Do you restore-test it, or is it a backup nobody has?",
        replyTo: 0,
      },
      {
        speaker: 0,
        text: "Restore-tested monthly into a scratch database. The first one failed, which is exactly why you test them.",
        replyTo: 1,
        pinned: true,
      },
      {
        speaker: 2,
        text: "What made it fail? Asking because mine has never failed and I no longer find that comforting.",
      },
      {
        speaker: 0,
        text: "Extension that was installed by hand and never written down. The dump referenced it, the scratch database did not have it.",
        replyTo: 3,
      },
      {
        speaker: 2,
        text: "Right. Going to go and check mine.",
        replyTo: 4,
        gap: 12,
      },
    ],
  },
  {
    theme: "introductions",
    cast: 4,
    beats: [
      {
        speaker: 0,
        text: "New here — joined after reading the write-up on the query planner. Mostly work on storage engines, occasionally on the tooling around them.",
        gap: 120,
      },
      {
        speaker: 1,
        text: "Welcome. The planner thread is still going if you want to add to it.",
        replyTo: 0,
      },
      {
        speaker: 2,
        text: "Also new. Front-end, currently fighting a virtualised list that will not hold its scroll position.",
        gap: 90,
      },
      {
        speaker: 3,
        text: "That is a solved problem right up until you prepend to the list, and then it is not. Happy to compare notes.",
        replyTo: 2,
      },
      {
        speaker: 2,
        text: "Prepending is exactly where it breaks. I will take you up on that.",
        replyTo: 3,
      },
    ],
  },
  {
    theme: "general",
    cast: 3,
    beats: [
      {
        speaker: 0,
        text: "Reminder that the office is closed Monday. {1} is on call anyway, because that is how the rota fell.",
        gap: 200,
      },
      {
        speaker: 1,
        text: "It is fine. Nothing ships Monday, which is the only reason I agreed.",
        replyTo: 0,
      },
      {
        speaker: 2,
        text: "Famous last words. Something always ships Monday.",
        replyTo: 1,
      },
      {
        speaker: 1,
        text: "Then it ships without me and I read about it Tuesday.",
        replyTo: 2,
        edited: true,
      },
    ],
  },
  {
    theme: "general",
    cast: 4,
    beats: [
      {
        speaker: 0,
        text: "Does anyone have context on why we have two config formats? I keep finding both and they disagree.",
        gap: 160,
      },
      {
        speaker: 1,
        text: "History. The YAML one predates the move, the TOML one came with the new loader and nobody finished the migration.",
        replyTo: 0,
      },
      {
        speaker: 2,
        text: "There is a third in the deploy scripts, if you want the complete picture.",
        replyTo: 1,
      },
      { speaker: 0, text: "I did not want the complete picture.", replyTo: 2 },
      {
        speaker: 3,
        text: "I will write up which one wins where. {0} if you hit another, add it to the thread rather than guessing.",
        gap: 12,
        pinned: true,
      },
    ],
  },
  {
    theme: "general",
    cast: 3,
    beats: [
      {
        speaker: 0,
        text: "Welcome to the three people who joined this week. Introduce yourselves whenever you like, no pressure.",
        gap: 320,
      },
      {
        speaker: 1,
        text: "Is there a doc for getting the stack running locally? I got as far as the database and stopped.",
        replyTo: 0,
      },
      {
        speaker: 0,
        text: "There is, and it is out of date in exactly one place — the compose profile changed names. `--profile full` now.",
        replyTo: 1,
      },
      {
        speaker: 2,
        text: "I hit that too last month and assumed it was me.",
        replyTo: 2,
      },
      {
        speaker: 0,
        text: "It was not you. I have fixed the doc, which I should have done last month.",
        replyTo: 3,
        edited: true,
      },
    ],
  },
  {
    theme: "random",
    cast: 3,
    beats: [
      {
        speaker: 0,
        text: "My standing desk has started descending on its own at 4pm. I have decided this is a feature.",
        gap: 240,
      },
      {
        speaker: 1,
        text: "It is telling you to go home. Listen to the desk.",
        replyTo: 0,
      },
      {
        speaker: 2,
        text: "{0} the controller has a timer mode, it is almost certainly that and not a haunting.",
        replyTo: 0,
      },
      {
        speaker: 0,
        text: "I prefer the haunting explanation and I am keeping it.",
        replyTo: 2,
      },
    ],
  },
  {
    theme: "tooling",
    cast: 3,
    beats: [
      {
        speaker: 0,
        text: "CI is down to four minutes from eleven. The cache key now includes the lockfile hash instead of just the branch:\n\n```yaml\nkey: deps-${{ hashFiles('pnpm-lock.yaml') }}\n```",
        pinned: true,
      },
      {
        speaker: 1,
        text: "So every branch was rebuilding from scratch?",
        replyTo: 0,
      },
      {
        speaker: 0,
        text: "Every branch, every push. The cache was there, it just never hit.",
        replyTo: 1,
      },
      {
        speaker: 2,
        text: "Stealing this for the other repo. {0} did you have to bump the cache version to evict the old entries?",
        gap: 25,
      },
      {
        speaker: 0,
        text: "No, the key change evicts them by itself.",
        replyTo: 3,
      },
    ],
  },
  {
    theme: "networking",
    cast: 3,
    beats: [
      {
        speaker: 0,
        text: "Split the lab onto its own VLAN over the weekend and the broadcast noise on the main network dropped to nothing.",
      },
      {
        speaker: 1,
        text: "Did you have to renumber, or did the DHCP scope cover it?",
        replyTo: 0,
      },
      {
        speaker: 0,
        text: "Renumbered. Which broke exactly one thing — a printer with a static address nobody had written down.",
        replyTo: 1,
      },
      {
        speaker: 2,
        text: "It is always the printer.",
        replyTo: 2,
      },
      {
        speaker: 0,
        text: "It is always the printer. Sanitised config is in the thread if anyone wants it.",
        replyTo: 3,
        gap: 30,
      },
    ],
  },
  {
    theme: "postmortems",
    cast: 3,
    beats: [
      {
        speaker: 0,
        text: 'Write-up for Tuesday is ready for review. Two action items, both small, and neither of them is "be more careful".',
        pinned: true,
      },
      {
        speaker: 1,
        text: "The detection gap is the interesting part. Six days is a long time for staging to look fine.",
        replyTo: 0,
      },
      {
        speaker: 0,
        text: "Agreed, and that is action item one: staging gets a tenant large enough for the planner to care about.",
        replyTo: 1,
      },
      {
        speaker: 2,
        text: "Item two being the regression test, I assume.",
        replyTo: 2,
      },
      {
        speaker: 0,
        text: "Already merged. {2} is reviewing the wording before it goes out.",
        replyTo: 3,
        gap: 18,
      },
    ],
  },
  {
    theme: "projects",
    cast: 3,
    beats: [
      {
        speaker: 0,
        text: "Spent three evenings writing a CLI that watches a directory and reruns one command. It is 200 lines and I use it constantly.",
      },
      {
        speaker: 1,
        text: "How is it different from the six that already exist?",
        replyTo: 0,
      },
      {
        speaker: 0,
        text: "It is not, really. But I understand this one, which turns out to matter more than I expected.",
        replyTo: 1,
      },
      {
        speaker: 2,
        text: "That is the correct reason to write a tool. Repo link?",
        replyTo: 2,
      },
      {
        speaker: 0,
        text: "In my profile. Feedback welcome, especially about the name, which I regret.",
        replyTo: 3,
        gap: 40,
      },
    ],
  },
  {
    theme: "announcements",
    cast: 2,
    beats: [
      {
        speaker: 0,
        text: "**4.2.1 is out.** It fixes the query-path regression from Tuesday and nothing else — the changelog really is two lines.\n\nIf you were seeing slow reads on large tenants, that was this.",
        pinned: true,
        gap: 400,
      },
      {
        speaker: 1,
        text: "Do we need to do anything, or does it roll out on its own?",
        replyTo: 0,
        gap: 25,
      },
      {
        speaker: 0,
        text: "On its own. It reached everyone about an hour ago.",
        replyTo: 1,
      },
    ],
  },
];
