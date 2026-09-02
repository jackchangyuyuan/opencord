import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { channels } from "./channels.js";

const byteOrderedText = customType<{ data: string; driverData: string }>({
  dataType: () => 'text collate "C"',
});

export const channelMembers = pgTable(
  "channel_members",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({
      name: "channel_members_pkey",
      columns: [table.channelId, table.userId],
    }),
    index("channel_members_user_id_idx").on(table.userId),
  ],
);

export const dmPairs = pgTable(
  "dm_pairs",
  {
    userA: byteOrderedText("user_a")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userB: byteOrderedText("user_b")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ name: "dm_pairs_pkey", columns: [table.userA, table.userB] }),
    unique("dm_pairs_channel_id_uq").on(table.channelId),
    check(
      "dm_pairs_canonical_order_check",
      sql`${table.userA} < ${table.userB}`,
    ),
  ],
);
