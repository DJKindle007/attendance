CREATE TABLE "checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_date" date NOT NULL,
	"dl_student_id" text NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'kiosk' NOT NULL,
	"slack_channel" text,
	"slack_ts" text,
	"slack_error" text,
	"undone_at" timestamp with time zone,
	"undone_by" text
);
--> statement-breakpoint
CREATE TABLE "guardian_contacts" (
	"student_school_id" text PRIMARY KEY NOT NULL,
	"emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"uploaded_by" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homeroom_status" (
	"run_date" date NOT NULL,
	"homeroom" text NOT NULL,
	"teacher_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enrolled" integer DEFAULT 0 NOT NULL,
	"rows_seen" integer DEFAULT 0 NOT NULL,
	"submitted_seen_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"remind_error" text,
	"escalate_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homeroom_status_run_date_homeroom_pk" PRIMARY KEY("run_date","homeroom")
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"run_date" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"dry_run" boolean DEFAULT true NOT NULL,
	"triggered_by" text,
	"summary" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "kiosk_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "kiosk_devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "parent_notices" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_date" date NOT NULL,
	"dl_student_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"to_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gmail_message_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"email" text PRIMARY KEY NOT NULL,
	"slack_user_id" text,
	"resolved_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "students_cache" (
	"dl_student_id" text PRIMARY KEY NOT NULL,
	"student_school_id" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"preferred_name" text,
	"grade" text,
	"homeroom" text,
	"guardian_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enrolled" boolean DEFAULT true NOT NULL,
	"enrollment_status" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "checkins_active_unique" ON "checkins" USING btree ("run_date","dl_student_id") WHERE "checkins"."undone_at" IS NULL;--> statement-breakpoint
CREATE INDEX "checkins_run_date_idx" ON "checkins" USING btree ("run_date");--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_running_unique" ON "job_runs" USING btree ("job","run_date") WHERE "job_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "job_runs_run_date_idx" ON "job_runs" USING btree ("run_date");--> statement-breakpoint
CREATE UNIQUE INDEX "parent_notices_unique" ON "parent_notices" USING btree ("run_date","dl_student_id","kind");--> statement-breakpoint
CREATE INDEX "parent_notices_run_date_idx" ON "parent_notices" USING btree ("run_date");