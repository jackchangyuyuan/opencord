import { config } from "../config.js";
import {
  acquireLeadership,
  releaseLeadership,
  RENEW_SECONDS,
  renewLeadership,
} from "../lib/leader-election.js";
import { logger } from "../lib/logger.js";
import { runAmbientActivity } from "./ambient-activity.js";
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
  {
    name: "ambient-activity",
    everyMs: config.AMBIENT_ACTIVITY_INTERVAL_MS,
    run: () => runAmbientActivity(),
  },
];

export interface JobRunner {
  stop: () => Promise<void>;
}

export interface JobRunnerOptions {
  renewMs?: number;
}

// The lease decides who runs the schedule; it does not fence anyone out of the
// database. A process paused past its expiry still completes statements it has
// already issued, so each job carries its own exclusion -- an advisory lock for
// the ambient pass, a row lock for expiry and anonymization, a re-read of
// references for the sweep.
export function startJobRunner(
  schedule: readonly ScheduledJob[] = jobs,
  options: JobRunnerOptions = {},
): JobRunner {
  const renewMs = options.renewMs ?? RENEW_SECONDS * 1000;
  const lastRun = new Map<string, number>();

  let leader = false;
  let stopped = false;
  let renewing: Promise<void> | null = null;
  let running: Promise<void> | null = null;

  function holdLeadership(): Promise<void> {
    renewing ??= (async () => {
      try {
        leader = leader ? await renewLeadership() : await acquireLeadership();
      } catch (error) {
        logger.warn({ err: error }, "Leader lock unavailable, skipping jobs");
        leader = false;
      }
    })().finally(() => {
      renewing = null;
    });

    return renewing;
  }

  async function pass(): Promise<void> {
    for (const job of schedule) {
      if (stopped || !leader) {
        return;
      }

      if ((lastRun.get(job.name) ?? 0) + job.everyMs > Date.now()) {
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
    if (stopped) {
      return;
    }

    await holdLeadership();

    running ??= pass().finally(() => {
      running = null;
    });

    await running;
  }

  const timer = setInterval(() => {
    void tick();
  }, renewMs);

  timer.unref();

  void tick();

  return {
    stop: async () => {
      stopped = true;
      clearInterval(timer);

      await running;
      await renewing;

      if (leader) {
        await releaseLeadership();
        leader = false;
      }
    },
  };
}
