ALTER TABLE "messages" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "pinned_by" text;--> statement-breakpoint
CREATE INDEX "messages_channel_id_pinned_at_idx" ON "messages" ("channel_id","pinned_at" DESC NULLS LAST) WHERE "pinned_at" is not null and "deleted_at" is null;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_pinned_by_users_id_fkey" FOREIGN KEY ("pinned_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_pin_pair_check" CHECK (("pinned_at" is null) = ("pinned_by" is null));