import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { uuid } from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { messages } from "./messages.js";

export const reactions = pgTable(
  "reactions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "reactions_pkey",
      columns: [table.messageId, table.userId, table.emoji],
    }),
    index("reactions_message_id_emoji_idx").on(table.messageId, table.emoji),
  ],
);
