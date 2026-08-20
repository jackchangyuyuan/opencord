CREATE TABLE "channel_member_overwrites" (
	"channel_id" uuid,
	"server_id" uuid NOT NULL,
	"user_id" text,
	"allow" integer DEFAULT 0 NOT NULL,
	"deny" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "channel_member_overwrites_pkey" PRIMARY KEY("channel_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "channel_role_overwrites" (
	"channel_id" uuid,
	"server_id" uuid NOT NULL,
	"role_id" uuid,
	"allow" integer DEFAULT 0 NOT NULL,
	"deny" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "channel_role_overwrites_pkey" PRIMARY KEY("channel_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "channel_member_overwrites" ADD CONSTRAINT "channel_member_overwrites_channel_id_server_id_fkey" FOREIGN KEY ("channel_id","server_id") REFERENCES "channels"("id","server_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "channel_member_overwrites" ADD CONSTRAINT "channel_member_overwrites_server_id_user_id_fkey" FOREIGN KEY ("server_id","user_id") REFERENCES "server_members"("server_id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "channel_role_overwrites" ADD CONSTRAINT "channel_role_overwrites_channel_id_server_id_fkey" FOREIGN KEY ("channel_id","server_id") REFERENCES "channels"("id","server_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "channel_role_overwrites" ADD CONSTRAINT "channel_role_overwrites_role_id_server_id_fkey" FOREIGN KEY ("role_id","server_id") REFERENCES "roles"("id","server_id") ON DELETE CASCADE;