ALTER TABLE "servers" ADD COLUMN "demo_role" text;--> statement-breakpoint
CREATE UNIQUE INDEX "servers_demo_template_uq" ON "servers" ("demo_role") WHERE "demo_role" = 'template';--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_demo_role_check" CHECK ("demo_role" is null or "demo_role" in ('community', 'template'));