ALTER TYPE "public"."workspace_role" ADD VALUE 'viewer';--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD COLUMN "custom_role" varchar(64);--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "custom_role" varchar(64);