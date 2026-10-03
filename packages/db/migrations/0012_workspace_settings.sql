ALTER TABLE "workspaces" ADD COLUMN "logo_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;