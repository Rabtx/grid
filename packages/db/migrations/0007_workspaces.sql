CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "workspace_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"icon" varchar(64),
	"color" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_slug_unique" ON "workspaces" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Every existing user gets a personal workspace (named after them, a unique slug from their
-- username that avoids the console's own route names) and owns it; their projects and
-- subscriptions move into it.
CREATE TEMP TABLE "_workspace_backfill" ON COMMIT DROP AS
WITH "base" AS (
	SELECT
		u."id" AS "user_id",
		coalesce(nullif(trim(p."display_name"), ''), u."username") AS "name",
		left(coalesce(nullif(trim(both '-' from regexp_replace(lower(u."username"), '[^a-z0-9]+', '-', 'g')), ''), 'workspace'), 50) AS "stem"
	FROM "users" u
	LEFT JOIN "user_profiles" p ON p."user_id" = u."id"
),
"safe" AS (
	SELECT "user_id", "name",
		CASE
			WHEN length("stem") < 2 OR "stem" IN ('login', 'logout', 'setup', 'invite', 'settings', 'board', 'chat', 'files', 'notes', 'terminal', 'api', 'uploads', 'runner', 'dev', 'new', 'workspaces', 'admin')
				THEN "stem" || '-workspace'
			ELSE "stem"
		END AS "stem"
	FROM "base"
),
"ranked" AS (
	SELECT "user_id", "name", "stem", row_number() OVER (PARTITION BY "stem" ORDER BY "user_id") AS "n"
	FROM "safe"
)
SELECT
	"user_id",
	left("name", 120) AS "name",
	CASE WHEN "n" = 1 THEN "stem" ELSE "stem" || '-' || "n" END AS "slug",
	gen_random_uuid() AS "workspace_id"
FROM "ranked";
--> statement-breakpoint
INSERT INTO "workspaces" ("id", "slug", "name") SELECT "workspace_id", "slug", "name" FROM "_workspace_backfill";
--> statement-breakpoint
INSERT INTO "workspace_members" ("workspace_id", "user_id", "role") SELECT "workspace_id", "user_id", 'owner' FROM "_workspace_backfill";
--> statement-breakpoint
UPDATE "projects" SET "workspace_id" = b."workspace_id", "created_by" = "projects"."owner_id"
FROM "_workspace_backfill" b WHERE b."user_id" = "projects"."owner_id";
--> statement-breakpoint
UPDATE "subscriptions" SET "workspace_id" = b."workspace_id"
FROM "_workspace_backfill" b WHERE b."user_id" = "subscriptions"."user_id";
