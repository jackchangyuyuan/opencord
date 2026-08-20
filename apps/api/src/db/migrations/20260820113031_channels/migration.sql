CREATE TYPE "channel_type" AS ENUM('text', 'dm');--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"server_id" uuid,
	"type" "channel_type" NOT NULL,
	"name" text,
	"topic" text,
	"position" integer DEFAULT 0 NOT NULL,
	"last_message_id" uuid,
	"last_everyone_mention_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channels_id_server_id_uq" UNIQUE("id","server_id"),
	CONSTRAINT "channels_dm_without_server_check" CHECK (("server_id" is null) = ("type" = 'dm'))
);
--> statement-breakpoint
CREATE INDEX "channels_server_id_position_id_idx" ON "channels" ("server_id","position","id");--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;