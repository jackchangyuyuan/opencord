import { index, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { channels } from "./channels.js";
import { messages } from "./messages.js";

export const mentions = pgTable(
  "mentions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({
      name: "mentions_pkey",
      columns: [table.userId, table.messageId],
    }),
    index("mentions_user_id_channel_id_message_id_idx").on(
      table.userId,
      table.channelId,
      table.messageId,
    ),
  ],
);
