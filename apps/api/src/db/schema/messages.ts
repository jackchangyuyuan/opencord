import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { channels } from "./channels.js";

const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => "tsvector",
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    nonce: uuid("nonce"),
    replyToId: uuid("reply_to_id"),
    mentionsEveryone: boolean("mentions_everyone").default(false).notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    pinnedBy: text("pinned_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('english', content)`,
    ),
  },
  (table) => [
    unique("messages_id_channel_id_uq").on(table.id, table.channelId),
    foreignKey({
      name: "messages_reply_to_id_channel_id_fkey",
      columns: [table.replyToId, table.channelId],
      foreignColumns: [table.id, table.channelId],
    }).onDelete("set null"),
    index("messages_channel_id_id_live_idx")
      .on(table.channelId, table.id.desc())
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex("messages_author_id_nonce_uidx")
      .on(table.authorId, table.nonce)
      .where(sql`${table.nonce} is not null`),
    index("messages_author_id_idx").on(table.authorId),
    index("messages_reply_to_id_idx").on(table.replyToId),
    index("messages_search_vector_idx").using("gin", table.searchVector),
    index("messages_channel_id_pinned_at_idx")
      .on(table.channelId, table.pinnedAt.desc())
      .where(sql`${table.pinnedAt} is not null and ${table.deletedAt} is null`),
    check(
      "messages_pin_pair_check",
      sql`(${table.pinnedAt} is null) = (${table.pinnedBy} is null)`,
    ),
  ],
);
