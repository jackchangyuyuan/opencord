CREATE TABLE "member_roles" (
	"server_id" uuid,
	"user_id" text,
	"role_id" uuid,
	CONSTRAINT "member_roles_pkey" PRIMARY KEY("server_id","user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"server_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" integer,
	"permissions" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_id_server_id_uq" UNIQUE("id","server_id")
);
--> statement-breakpoint
CREATE TABLE "server_members" (
	"server_id" uuid,
	"user_id" text,
	"nickname" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_members_pkey" PRIMARY KEY("server_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text NOT NULL,
	"icon_key" text,
	"owner_id" text NOT NULL,
	"is_demo_sandbox" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "member_roles_role_id_idx" ON "member_roles" ("role_id");--> statement-breakpoint
CREATE INDEX "roles_server_id_idx" ON "roles" ("server_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_server_id_is_default_uidx" ON "roles" ("server_id") WHERE "is_default";--> statement-breakpoint
CREATE INDEX "server_members_user_id_idx" ON "server_members" ("user_id");--> statement-breakpoint
CREATE INDEX "servers_owner_id_idx" ON "servers" ("owner_id");--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_server_id_user_id_fkey" FOREIGN KEY ("server_id","user_id") REFERENCES "server_members"("server_id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_role_id_server_id_fkey" FOREIGN KEY ("role_id","server_id") REFERENCES "roles"("id","server_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server_members" ADD CONSTRAINT "server_members_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server_members" ADD CONSTRAINT "server_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id");