import { logger } from "../lib/logger.js";
import { ensureDemoDataset } from "../modules/demo/provision.js";
import { db } from "./index.js";
import { runMigrations } from "./migrator.js";

await runMigrations();

const provisioned = await ensureDemoDataset();

logger.info(
  { provisioned },
  provisioned
    ? "Bootstrap complete; the demo dataset was provisioned"
    : "Bootstrap complete; the demo dataset was already present",
);

await db.$client.end();
