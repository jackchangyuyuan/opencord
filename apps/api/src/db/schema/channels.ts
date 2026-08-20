import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { servers } from "./servers.js";

export const channelType = pgEnum("channel_type", ["text", "dm"]);

export type ChannelType = (typeof channelType.enumValues)[number];

export const channels = pgTable(
  "channels",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    serverId: uuid("server_id").references(() => servers.id, {
      onDelete: "cascade",
    }),
    type: channelType("type").notNull(),
    name: text("name"),
    topic: text("topic"),
    position: integer("position").default(0).notNull(),
    lastMessageId: uuid("last_message_id"),
    lastEveryoneMentionId: uuid("last_everyone_mention_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("channels_server_id_position_id_idx").on(
      table.serverId,
      table.position,
      table.id,
    ),
    unique("channels_id_server_id_uq").on(table.id, table.serverId),
    check(
      "channels_dm_without_server_check",
      sql`(${table.serverId} is null) = (${table.type} = 'dm')`,
    ),
  ],
);

export type ChannelRow = typeof channels.$inferSelect;
