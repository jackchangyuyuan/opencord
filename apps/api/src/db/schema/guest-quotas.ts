import { sql } from "drizzle-orm";
import { check, integer, pgTable, text } from "drizzle-orm/pg-core";

import { users } from "./auth.js";

export const guestQuotas = pgTable(
  "guest_quotas",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    messagesSent: integer("messages_sent").default(0).notNull(),
    uploadGrants: integer("upload_grants").default(0).notNull(),
    uploadBytes: integer("upload_bytes").default(0).notNull(),
    serversCreated: integer("servers_created").default(0).notNull(),
    invitesCreated: integer("invites_created").default(0).notNull(),
  },
  (table) => [
    check("guest_quotas_messages_sent_check", sql`${table.messagesSent} >= 0`),
    check("guest_quotas_upload_grants_check", sql`${table.uploadGrants} >= 0`),
    check("guest_quotas_upload_bytes_check", sql`${table.uploadBytes} >= 0`),
    check(
      "guest_quotas_servers_created_check",
      sql`${table.serversCreated} >= 0`,
    ),
    check(
      "guest_quotas_invites_created_check",
      sql`${table.invitesCreated} >= 0`,
    ),
  ],
);
