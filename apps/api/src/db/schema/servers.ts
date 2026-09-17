import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";

export const DEMO_ROLES = ["community", "template"] as const;

export type DemoRole = (typeof DEMO_ROLES)[number];

export const servers = pgTable(
  "servers",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text("name").notNull(),
    description: text("description"),
    iconKey: text("icon_key"),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    isDemoSandbox: boolean("is_demo_sandbox").default(false).notNull(),
    demoRole: text("demo_role").$type<DemoRole>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("servers_owner_id_idx").on(table.ownerId),
    check(
      "servers_demo_role_check",
      sql`${table.demoRole} is null or ${table.demoRole} in ('community', 'template')`,
    ),
    uniqueIndex("servers_demo_template_uq")
      .on(table.demoRole)
      .where(sql`${table.demoRole} = 'template'`),
  ],
);

export const serverMembers = pgTable(
  "server_members",
  {
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nickname: text("nickname"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "server_members_pkey",
      columns: [table.serverId, table.userId],
    }),
    index("server_members_user_id_idx").on(table.userId),
  ],
);

export type ServerRow = typeof servers.$inferSelect;
