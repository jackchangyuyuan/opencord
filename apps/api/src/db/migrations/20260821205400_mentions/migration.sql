CREATE TABLE "mentions" (
	"user_id" text,
	"message_id" uuid,
	"channel_id" uuid NOT NULL,
	CONSTRAINT "mentions_pkey" PRIMARY KEY("user_id","message_id")
);
--> statement-breakpoint
CREATE INDEX "mentions_user_id_channel_id_message_id_idx" ON "mentions" ("user_id","channel_id","message_id");--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_message_id_messages_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_channel_id_channels_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE;