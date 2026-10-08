CREATE TABLE "thread_attachments" (
	"thread_id" varchar(120) NOT NULL,
	"id" varchar(120) NOT NULL,
	"name" text NOT NULL,
	"mime_type" varchar(200) NOT NULL,
	"size" integer NOT NULL,
	"data" text NOT NULL,
	CONSTRAINT "thread_attachments_thread_id_id_pk" PRIMARY KEY("thread_id","id")
);
--> statement-breakpoint
ALTER TABLE "thread_attachments" ADD CONSTRAINT "thread_attachments_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;