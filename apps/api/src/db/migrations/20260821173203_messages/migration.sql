CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"channel_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"nonce" uuid,
	"reply_to_id" uuid,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_id_channel_id_uq" UNIQUE("id","channel_id")
);
--> statement-breakpoint
CREATE INDEX "messages_channel_id_id_live_idx" ON "messages" ("channel_id","id" DESC NULLS LAST) WHERE "deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_author_id_nonce_uidx" ON "messages" ("author_id","nonce") WHERE "nonce" is not null;--> statement-breakpoint
CREATE INDEX "messages_reply_to_id_idx" ON "messages" ("reply_to_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_channels_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_channel_id_fkey" FOREIGN KEY ("reply_to_id","channel_id") REFERENCES "messages"("id","channel_id") ON DELETE SET NULL ("reply_to_id");

CREATE INDEX "messages_author_id_idx" ON "messages" ("author_id");