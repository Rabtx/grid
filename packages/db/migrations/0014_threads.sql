CREATE TABLE "thread_events" (
	"thread_id" varchar(120) NOT NULL,
	"seq" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "thread_events_thread_id_seq_pk" PRIMARY KEY("thread_id","seq")
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" varchar(120) PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project" varchar(120) NOT NULL,
	"owner_id" uuid,
	"provider" varchar(64) NOT NULL,
	"title" text NOT NULL,
	"model" varchar(200),
	"mode" varchar(64),
	"effort" varchar(32),
	"machine_id" varchar(64) NOT NULL,
	"machine_name" varchar(200),
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "thread_events" ADD CONSTRAINT "thread_events_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "threads_workspace_project_idx" ON "threads" USING btree ("workspace_id","project","updated_at");--> statement-breakpoint
CREATE INDEX "threads_machine_idx" ON "threads" USING btree ("machine_id");