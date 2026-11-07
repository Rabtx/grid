ALTER TABLE "tasks" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DATA TYPE varchar(48) USING "status"::text;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'backlog';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "workflow" jsonb;--> statement-breakpoint
DROP TYPE "public"."task_status";
