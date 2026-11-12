CREATE TYPE "public"."machine_kind" AS ENUM('managed', 'byom');--> statement-breakpoint
CREATE TYPE "public"."machine_status" AS ENUM('pending', 'online', 'offline', 'disabled');--> statement-breakpoint
CREATE TABLE "machine_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"machine_id" uuid NOT NULL,
	"created_by" uuid,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machine_placements" (
	"workspace_id" uuid NOT NULL,
	"project" varchar(120) NOT NULL,
	"machine_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "machine_placements_workspace_id_project_pk" PRIMARY KEY("workspace_id","project")
);
--> statement-breakpoint
CREATE TABLE "machines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_id" uuid,
	"name" varchar(200) NOT NULL,
	"kind" "machine_kind" DEFAULT 'byom' NOT NULL,
	"status" "machine_status" DEFAULT 'pending' NOT NULL,
	"address" varchar(2048),
	"secret_hash" varchar(64),
	"platform" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "machine_enrollments" ADD CONSTRAINT "machine_enrollments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_enrollments" ADD CONSTRAINT "machine_enrollments_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_enrollments" ADD CONSTRAINT "machine_enrollments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_placements" ADD CONSTRAINT "machine_placements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_placements" ADD CONSTRAINT "machine_placements_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "machine_enrollments_token_hash_unique" ON "machine_enrollments" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "machine_enrollments_machine_id_idx" ON "machine_enrollments" USING btree ("machine_id");--> statement-breakpoint
CREATE INDEX "machine_enrollments_expires_at_idx" ON "machine_enrollments" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "machine_placements_machine_id_idx" ON "machine_placements" USING btree ("machine_id");--> statement-breakpoint
CREATE INDEX "machines_workspace_id_idx" ON "machines" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "machines_owner_id_idx" ON "machines" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "machines_last_seen_idx" ON "machines" USING btree ("last_seen_at");
