CREATE TABLE "reactions" (
	"message_id" uuid,
	"user_id" text,
	"emoji" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_pkey" PRIMARY KEY("message_id","user_id","emoji")
);
--> statement-breakpoint
CREATE INDEX "reactions_message_id_emoji_idx" ON "reactions" ("message_id","emoji");--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_message_id_messages_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;