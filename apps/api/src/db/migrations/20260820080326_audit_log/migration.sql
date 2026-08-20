CREATE TYPE "audit_action" AS ENUM('member_kick', 'member_ban', 'member_unban', 'invite_create', 'invite_redeem', 'role_create', 'role_update', 'role_delete', 'role_assign', 'role_unassign', 'overwrite_update', 'overwrite_delete', 'channel_create', 'channel_update', 'channel_delete', 'server_update', 'server_transfer', 'message_delete', 'message_pin', 'message_unpin');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"server_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_log_server_id_id_idx" ON "audit_log" ("server_id","id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id");