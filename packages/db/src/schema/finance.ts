import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organization } from './organizations';
import { user } from './auth';

// Whole domain aggregates save together: transfer legs and allocations cannot be
// independently committed. Relational columns enforce tenancy and versioning.
export const financeRecords = pgTable(
  'finance_records',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    resource: text('resource').notNull(),
    id: text('id').notNull(),
    version: integer('version').notNull(),
    data: jsonb('data').$type<unknown>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.resource, table.id] }),
    check('finance_record_version', sql`${table.version} > 0`),
    check(
      'finance_record_identity',
      sql`${table.data}->>'id' = ${table.id} AND ${table.data}->>'workspaceId' = ${table.workspaceId} AND (${table.data}->>'version')::integer = ${table.version}`,
    ),
    check(
      'finance_record_resource',
      sql`${table.resource} IN ('accounts','categories','merchants','tags','transactions','budgets','goals','contributions','settings')`,
    ),
  ],
);
export const financeOperations = pgTable(
  'finance_operations',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    operationId: uuid('operation_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    result: jsonb('result').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.actorId, table.operationId],
    }),
  ],
);
export const financeAudit = pgTable(
  'finance_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id),
    operationId: uuid('operation_id').notNull(),
    resource: text('resource').notNull(),
    entityId: text('entity_id').notNull(),
    before: jsonb('before').$type<unknown>(),
    after: jsonb('after').$type<unknown>().notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('finance_audit_workspace').on(table.workspaceId, table.createdAt),
  ],
);
