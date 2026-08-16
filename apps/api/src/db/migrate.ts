import { join } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { config } from "../config.js";

const client = postgres(config.DATABASE_URL, { max: 1 });

await migrate(drizzle({ client }), {
  migrationsFolder: join(import.meta.dirname, "migrations"),
});

await client.end();
