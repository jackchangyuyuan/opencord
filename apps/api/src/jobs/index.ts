import {
  acquireLeadership,
  releaseLeadership,
  RENEW_SECONDS,
  renewLeadership,
} from "../lib/leader-election.js";
import { logger } from "../lib/logger.js";
import { ANONYMIZE_INTERVAL_MS, runGuestAnonymize } from "./guest-anonymize.js";
import { GUEST_EXPIRY_INTERVAL_MS, runGuestExpiry } from "./guest-expiry.js";
import { runOrphanSweep } from "./orphan-sweep.js";

export const NIGHTLY_MS = 24 * 60 * 60 * 1000;

export interface ScheduledJob {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

export const jobs: ScheduledJob[] = [
  {
    name: "guest-expiry",
    everyMs: GUEST_EXPIRY_INTERVAL_MS,
    run: () => runGuestExpiry(),
  },
  {
    name: "guest-anonymize",
    everyMs: ANONYMIZE_INTERVAL_MS,
    run: () => runGuestAnonymize(),
  },
  { name: "orphan-sweep", everyMs: NIGHTLY_MS, run: () => runOrphanSweep() },
];

export interface JobRunner {
  stop: () => Promise<void>;
}

export function startJobRunner(
  schedule: readonly ScheduledJob[] = jobs,
): JobRunner {
  const lastRun = new Map<string, number>();

  const state = { leader: false, stopped: false };

  let running: Promise<void> | null = null;

  const runnable = (): boolean => !state.stopped && state.leader;

  async function pass(): Promise<void> {
    for (const job of schedule) {
      const due = (lastRun.get(job.name) ?? 0) + job.everyMs <= Date.now();

      if (!due || !runnable()) {
        continue;
      }

      lastRun.set(job.name, Date.now());

      try {
        await job.run();
      } catch (error) {
        logger.error({ err: error, job: job.name }, "Scheduled job failed");
      }
    }
  }

  async function tick(): Promise<void> {
    if (state.stopped) {
      return;
    }

    try {
      state.leader = state.leader
        ? await renewLeadership()
        : await acquireLeadership();
    } catch (error) {
      logger.warn({ err: error }, "Leader lock unavailable, skipping jobs");
      state.leader = false;
      return;
    }

    running ??= pass().finally(() => {
      running = null;
    });

    await running;
  }

  const timer = setInterval(() => {
    void tick();
  }, RENEW_SECONDS * 1000);

  timer.unref();

  void tick();

  return {
    stop: async () => {
      state.stopped = true;
      clearInterval(timer);

      await running;

      if (state.leader) {
        await releaseLeadership();
        state.leader = false;
      }
    },
  };
}
