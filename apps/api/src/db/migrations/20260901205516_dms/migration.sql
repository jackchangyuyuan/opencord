CREATE TABLE "channel_members" (
	"channel_id" uuid,
	"user_id" text,
	CONSTRAINT "channel_members_pkey" PRIMARY KEY("channel_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "dm_pairs" (
	"user_a" text collate "C",
	"user_b" text collate "C",
	"channel_id" uuid NOT NULL CONSTRAINT "dm_pairs_channel_id_uq" UNIQUE,
	CONSTRAINT "dm_pairs_pkey" PRIMARY KEY("user_a","user_b"),
	CONSTRAINT "dm_pairs_canonical_order_check" CHECK ("user_a" < "user_b")
);
--> statement-breakpoint
CREATE INDEX "channel_members_user_id_idx" ON "channel_members" ("user_id");--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channel_id_channels_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dm_pairs" ADD CONSTRAINT "dm_pairs_user_a_users_id_fkey" FOREIGN KEY ("user_a") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dm_pairs" ADD CONSTRAINT "dm_pairs_user_b_users_id_fkey" FOREIGN KEY ("user_b") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dm_pairs" ADD CONSTRAINT "dm_pairs_channel_id_channels_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE;