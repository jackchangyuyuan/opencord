import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { config } from "../config.js";
import { logger } from "../lib/logger.js";

const client = postgres(config.DATABASE_URL, {
  onnotice: (notice) => {
    logger.debug({ notice }, "PostgreSQL notice");
  },
});

export const db = drizzle({ client });

export type Transaction = Parameters<
  Parameters<(typeof db)["transaction"]>[0]
>[0];
