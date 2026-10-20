CREATE TABLE "desktop_session_links" (
	"session_id" text PRIMARY KEY NOT NULL,
	"desktop_session_id" text NOT NULL,
	"seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "start_folder" text;