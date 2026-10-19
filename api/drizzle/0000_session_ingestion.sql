CREATE TABLE "log_files" (
	"path" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"modified_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"logs_dir" text NOT NULL,
	"is_logs_dir_found" boolean NOT NULL,
	"sessions_added" integer NOT NULL,
	"sessions_updated" integer NOT NULL,
	"sessions_archived" integer NOT NULL,
	"unreadable_lines" integer NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"session_id" text NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "prompts_session_id_position_pk" PRIMARY KEY("session_id","position")
);
--> statement-breakpoint
CREATE TABLE "session_model_usages" (
	"session_id" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" bigint NOT NULL,
	"output_tokens" bigint NOT NULL,
	"cache_read_tokens" bigint NOT NULL,
	"cache_write_tokens" bigint NOT NULL,
	CONSTRAINT "session_model_usages_session_id_model_pk" PRIMARY KEY("session_id","model")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"title" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"git_branch" text,
	"origin" text,
	"prompt_count" integer NOT NULL,
	"subagent_count" integer NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"path_key" text NOT NULL,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"is_scratch" boolean DEFAULT false NOT NULL,
	CONSTRAINT "workspaces_pathKey_unique" UNIQUE("path_key")
);
--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_model_usages" ADD CONSTRAINT "session_model_usages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_workspace_id_started_at_index" ON "sessions" USING btree ("workspace_id","started_at");