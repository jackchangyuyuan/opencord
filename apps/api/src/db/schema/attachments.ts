import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { messages } from "./messages.js";

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull().unique(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
  },
  (table) => [index("attachments_message_id_idx").on(table.messageId)],
);
