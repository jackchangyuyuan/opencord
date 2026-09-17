export interface DmLine {
  from: "them" | "visitor";
  text: string;
}

export interface DmThread {
  counterpartOffset: number;
  freshnessMinutes: number;
  unread: number;
  lines: DmLine[];
}

export const DM_THREADS: DmThread[] = [
  {
    counterpartOffset: 0,
    freshnessMinutes: 4,
    unread: 2,
    lines: [
      { from: "them", text: "did the keyset cursor land?" },
      {
        from: "visitor",
        text: "yes, merged this morning. 240ms → 9ms on the busy channel.",
      },
      { from: "them", text: "that is the partial index doing the work?" },
      {
        from: "visitor",
        text: "mostly. EXPLAIN is in the engineering thread if you want it.",
      },
      { from: "them", text: "reading it now" },
      {
        from: "them",
        text: "one thing — the `around=` path still scans backwards twice. worth a look before Friday?",
      },
    ],
  },
  {
    counterpartOffset: 12,
    freshnessMinutes: 47,
    unread: 1,
    lines: [
      { from: "them", text: "morning — are you in the design review at 2?" },
      { from: "visitor", text: "I can be. is it the composer or the rail?" },
      { from: "them", text: "composer. the mention menu specifically." },
      {
        from: "visitor",
        text: "then yes. I have opinions about where the menu should anchor.",
      },
      { from: "them", text: "I was counting on that" },
    ],
  },
  {
    counterpartOffset: 24,
    freshnessMinutes: 3 * 60 + 20,
    unread: 0,
    lines: [
      {
        from: "them",
        text: "heads up: I am on call this week, so I will be slow on reviews",
      },
      { from: "visitor", text: "noted. anything paging yet?" },
      { from: "them", text: "one flap on the readiness probe. redis, not us." },
      { from: "visitor", text: "the lazyConnect thing?" },
      {
        from: "them",
        text: "that is the one. it recovered on its own, which is the whole point of the fast fail.",
      },
      { from: "visitor", text: "good. ping me if it gets loud." },
    ],
  },
  {
    counterpartOffset: 6,
    freshnessMinutes: 26 * 60,
    unread: 3,
    lines: [
      { from: "visitor", text: "do you have the migration runbook handy?" },
      {
        from: "them",
        text: "in the docs folder — but the short version is: apply, verify the watermark repair, then reseed.",
      },
      { from: "visitor", text: "and if the repair finds nothing?" },
      {
        from: "them",
        text: "then the corpus was already consistent and you are done.",
      },
      { from: "them", text: "I will write it up properly this week" },
      {
        from: "them",
        text: "…which I have now said three weeks running, I realise",
      },
    ],
  },
  {
    counterpartOffset: 9,
    freshnessMinutes: 4 * 24 * 60,
    unread: 0,
    lines: [
      { from: "them", text: "welcome aboard! shout if anything is confusing." },
      {
        from: "visitor",
        text: "thanks — where does the sandbox server come from?",
      },
      {
        from: "them",
        text: "it is cloned for you when you join. you own it, so you can break it however you like.",
      },
      { from: "visitor", text: "that is a good way to demo permissions" },
      { from: "them", text: "that was the idea" },
    ],
  },
  {
    counterpartOffset: 16,
    freshnessMinutes: 19 * 24 * 60,
    unread: 0,
    lines: [
      { from: "them", text: "left you the kettle notes in #random" },
      { from: "visitor", text: "I regret asking" },
      { from: "them", text: "you will regret it more after you read them" },
    ],
  },
];

export const DM_THREAD_COUNT = DM_THREADS.length;

export const MAX_COUNTERPART_OFFSET = Math.max(
  ...DM_THREADS.map((thread) => thread.counterpartOffset),
);
