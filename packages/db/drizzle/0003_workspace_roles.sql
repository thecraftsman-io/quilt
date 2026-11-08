ALTER TABLE "member" ALTER COLUMN "role" SET DEFAULT 'editor';--> statement-breakpoint
CREATE UNIQUE INDEX "member_workspace_user_unique" ON "member" USING btree ("organization_id","user_id");
--> statement-breakpoint
UPDATE member SET role = 'editor' WHERE role IN ('admin', 'member');
--> statement-breakpoint
UPDATE invitation SET role = 'editor' WHERE role IN ('admin', 'member');
