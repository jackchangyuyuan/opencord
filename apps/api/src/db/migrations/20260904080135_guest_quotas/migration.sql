CREATE TABLE "guest_quotas" (
	"user_id" text PRIMARY KEY,
	"messages_sent" integer DEFAULT 0 NOT NULL,
	"upload_grants" integer DEFAULT 0 NOT NULL,
	"upload_bytes" integer DEFAULT 0 NOT NULL,
	"servers_created" integer DEFAULT 0 NOT NULL,
	"invites_created" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "guest_quotas_messages_sent_check" CHECK ("messages_sent" >= 0),
	CONSTRAINT "guest_quotas_upload_grants_check" CHECK ("upload_grants" >= 0),
	CONSTRAINT "guest_quotas_upload_bytes_check" CHECK ("upload_bytes" >= 0),
	CONSTRAINT "guest_quotas_servers_created_check" CHECK ("servers_created" >= 0),
	CONSTRAINT "guest_quotas_invites_created_check" CHECK ("invites_created" >= 0)
);
--> statement-breakpoint
ALTER TABLE "guest_quotas" ADD CONSTRAINT "guest_quotas_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;