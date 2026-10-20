CREATE TABLE "refresh_schedules" (
	"id" integer PRIMARY KEY NOT NULL,
	"interval_minutes" integer,
	"updated_at" timestamp with time zone NOT NULL
);
