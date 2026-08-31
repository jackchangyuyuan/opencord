CREATE TABLE "bans" (
	"server_id" uuid,
	"user_id" text,
	"reason" text,
	"banned_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bans_pkey" PRIMARY KEY("server_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_banned_by_users_id_fkey" FOREIGN KEY ("banned_by") REFERENCES "users"("id");