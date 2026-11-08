CREATE TABLE "finance_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"resource" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_operations" (
	"workspace_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_operations_workspace_id_actor_id_operation_id_pk" PRIMARY KEY("workspace_id","actor_id","operation_id")
);
--> statement-breakpoint
CREATE TABLE "finance_records" (
	"workspace_id" text NOT NULL,
	"resource" text NOT NULL,
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "finance_records_workspace_id_resource_id_pk" PRIMARY KEY("workspace_id","resource","id"),
	CONSTRAINT "finance_record_version" CHECK ("finance_records"."version" > 0),
	CONSTRAINT "finance_record_identity" CHECK ("finance_records"."data"->>'id' = "finance_records"."id" AND "finance_records"."data"->>'workspaceId' = "finance_records"."workspace_id" AND ("finance_records"."data"->>'version')::integer = "finance_records"."version"),
	CONSTRAINT "finance_record_resource" CHECK ("finance_records"."resource" IN ('accounts','categories','merchants','tags','transactions','budgets','goals','contributions','settings'))
);
--> statement-breakpoint
ALTER TABLE "finance_audit" ADD CONSTRAINT "finance_audit_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_audit" ADD CONSTRAINT "finance_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_operations" ADD CONSTRAINT "finance_operations_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_operations" ADD CONSTRAINT "finance_operations_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_records" ADD CONSTRAINT "finance_records_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_audit_workspace" ON "finance_audit" USING btree ("workspace_id","created_at");