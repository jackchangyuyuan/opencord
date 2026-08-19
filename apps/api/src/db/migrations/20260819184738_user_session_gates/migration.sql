ALTER TABLE "users" ADD COLUMN "deactivated_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "guest_expires_at" timestamp;