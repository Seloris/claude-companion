CREATE TABLE "skill_calls" (
	"session_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"args" text,
	"called_at" timestamp with time zone NOT NULL,
	"is_typed" boolean NOT NULL,
	"agent_id" text,
	"prompt_position" integer,
	CONSTRAINT "skill_calls_session_id_position_pk" PRIMARY KEY("session_id","position")
);
--> statement-breakpoint
CREATE TABLE "subagent_model_usages" (
	"session_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" bigint NOT NULL,
	"output_tokens" bigint NOT NULL,
	"cache_read_tokens" bigint NOT NULL,
	"cache_write_tokens" bigint NOT NULL,
	CONSTRAINT "subagent_model_usages_session_id_agent_id_model_pk" PRIMARY KEY("session_id","agent_id","model")
);
--> statement-breakpoint
CREATE TABLE "subagents" (
	"session_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"agent_type" text NOT NULL,
	"model" text,
	"description" text NOT NULL,
	"launched_at" timestamp with time zone NOT NULL,
	"tool_call_count" integer NOT NULL,
	"is_log_missing" boolean NOT NULL,
	CONSTRAINT "subagents_session_id_agent_id_pk" PRIMARY KEY("session_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"session_id" text NOT NULL,
	"tool_use_id" text NOT NULL,
	"agent_id" text,
	"name" text NOT NULL,
	"mcp_server" text,
	"called_at" timestamp with time zone NOT NULL,
	"is_error" boolean,
	CONSTRAINT "tool_calls_session_id_tool_use_id_pk" PRIMARY KEY("session_id","tool_use_id")
);
--> statement-breakpoint
ALTER TABLE "refresh_runs" ADD COLUMN "mode" text DEFAULT 'incremental' NOT NULL;--> statement-breakpoint
ALTER TABLE "refresh_runs" ADD COLUMN "sessions_read" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "tool_call_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "failed_tool_call_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "skill_call_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "agent_types" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_calls" ADD CONSTRAINT "skill_calls_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subagent_model_usages" ADD CONSTRAINT "subagent_model_usages_session_id_agent_id_subagents_session_id_agent_id_fk" FOREIGN KEY ("session_id","agent_id") REFERENCES "public"."subagents"("session_id","agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subagents" ADD CONSTRAINT "subagents_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tool_calls_name_index" ON "tool_calls" USING btree ("name");