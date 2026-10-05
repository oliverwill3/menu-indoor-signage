CREATE TABLE "tenant_state" (
	"tenant_id" text PRIMARY KEY,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
