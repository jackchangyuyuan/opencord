import { join } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach } from "vitest";

const DUPLICATE_DATABASE = "42P04";

const QUIET = { max: 1, onnotice: () => undefined } as const;

const poolId = process.env["VITEST_POOL_ID"] ?? "1";
const maintenanceUrl = process.env["TEST_DATABASE_URL"];
const migrationsFolder = join(import.meta.dirname, "../src/db/migrations");

export const testDatabaseName = `opencord_test_${poolId}`;

process.env["PRESENCE_NAMESPACE"] = `presence-test-${poolId}`;

export function requireTestDatabase(): void {
  if (maintenanceUrl === undefined) {
    throw new Error(
      "TEST_DATABASE_URL is not set, and this suite needs a database",
    );
  }
}

function testDatabaseUrl(base: string): string {
  const url = new URL(base);
  url.pathname = `/${testDatabaseName}`;
  return url.href;
}

if (maintenanceUrl !== undefined) {
  process.env["DATABASE_URL"] = testDatabaseUrl(maintenanceUrl);
}

async function createTestDatabase(base: string): Promise<void> {
  const maintenance = postgres(base, QUIET);

  try {
    await maintenance.unsafe(
      `CREATE DATABASE "${testDatabaseName}" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER libc LC_COLLATE 'en_US.utf8' LC_CTYPE 'en_US.utf8'`,
    );
  } catch (error) {
    if (
      !(error instanceof postgres.PostgresError) ||
      error.code !== DUPLICATE_DATABASE
    ) {
      throw error;
    }
  } finally {
    await maintenance.end();
  }
}

let client: postgres.Sql | undefined;
let truncateAll: string | undefined;

beforeAll(async () => {
  if (maintenanceUrl === undefined) {
    return;
  }

  await createTestDatabase(maintenanceUrl);

  client = postgres(testDatabaseUrl(maintenanceUrl), QUIET);

  await migrate(drizzle({ client }), { migrationsFolder });

  const tables = await client<{ name: string }[]>`
    select tablename as name from pg_tables where schemaname = 'public'
  `;

  if (tables.length > 0) {
    const list = tables.map((table) => `"${table.name}"`).join(", ");

    truncateAll = `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`;
  }
});

beforeEach(async () => {
  if (client === undefined || truncateAll === undefined) {
    return;
  }

  await client.unsafe(truncateAll);
});

afterAll(async () => {
  await client?.end();
  client = undefined;
  truncateAll = undefined;
});
