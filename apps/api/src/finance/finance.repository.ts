import { Injectable, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  FinanceRecordSchemas,
  type FinanceRecord,
  type FinanceRecordMap,
  type FinanceResource,
  type FinanceListQuery,
  type WorkspaceAccess,
} from '@quilt/contracts';
import type { WorkspacePermission } from '@quilt/domain';
import { requireWorkspacePermission, workspaceRole } from './finance-policy';

export interface FinanceSession {
  workspace: WorkspaceAccess;
  get<K extends FinanceResource>(
    resource: K,
    id: string,
  ): Promise<FinanceRecordMap[K] | null>;
  page(
    resource: FinanceResource,
    limit: number,
    offset: number,
    filters?: FinanceListQuery,
  ): Promise<{
    items: FinanceRecord[];
    total: number;
    limit: number;
    offset: number;
  }>;
  list<K extends FinanceResource>(resource: K): Promise<FinanceRecordMap[K][]>;
  save(
    resource: FinanceResource,
    value: FinanceRecord,
    previous: FinanceRecord | null,
    operationId: string,
    reason?: string,
  ): Promise<void>;
  operation(
    operationId: string,
  ): Promise<{ fingerprint: string; result: unknown } | null>;
  remember(
    operationId: string,
    fingerprint: string,
    result: unknown,
  ): Promise<void>;
}
@Injectable()
export class FinanceRepository {
  constructor(private readonly database: DatabaseService) {}

  async run<T>(
    workspaceId: string,
    actorId: string,
    permission: WorkspacePermission,
    work: (session: FinanceSession) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.db.$client.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '10s'");
      // Serialize related financial changes, including retry checks and refund
      // limits. Membership row locks also serialize against auth-plugin revocation.
      const members = await client.query<{ role: string; name: string }>(
        'SELECT m.role, o.name FROM member m JOIN organization o ON o.id=m.organization_id WHERE m.organization_id = $1 AND m.user_id = $2 FOR SHARE OF m',
        [workspaceId, actorId],
      );
      requireWorkspacePermission(
        members.rows.length === 1 ? members.rows[0]?.role : undefined,
        permission,
      );
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [workspaceId],
      );
      const result = await work({
        workspace: {
          id: workspaceId as WorkspaceAccess['id'],
          name: members.rows[0]!.name,
          role: workspaceRole(members.rows[0]!.role)!,
        },
        get: async <K extends FinanceResource>(resource: K, id: string) => {
          const rows = await client.query<{ data: unknown }>(
            'SELECT data FROM finance_records WHERE workspace_id=$1 AND resource=$2 AND id=$3',
            [workspaceId, resource, id],
          );
          return rows.rows[0]
            ? (FinanceRecordSchemas[resource].parse(
                rows.rows[0].data,
              ) as FinanceRecordMap[K])
            : null;
        },
        page: async (resource, limit, offset, filters) => {
          const where = `workspace_id=$1 AND resource=$2
            AND ($3::text IS NULL OR data->>'accountId'=$3 OR data->'debit'->>'accountId'=$3 OR data->'credit'->>'accountId'=$3)
            AND ($4::text IS NULL OR data->>'kind'=$4)
            AND ($5::text IS NULL OR data->>'status'=$5)
            AND ($6::text IS NULL OR data->>'occurredOn' LIKE $6 || '%')
            AND ($7::text IS NULL OR $7='all' OR ($7='active' AND data->>'voidedAt' IS NULL) OR ($7='voided' AND data->>'voidedAt' IS NOT NULL))
            AND ($8::text IS NULL OR data->>'note' ILIKE $8 OR data->>'reason' ILIKE $8 OR EXISTS (SELECT 1 FROM finance_records merchant WHERE merchant.workspace_id=finance_records.workspace_id AND merchant.resource='merchants' AND merchant.id=finance_records.data->>'merchantId' AND merchant.data->>'name' ILIKE $8))`;
          const values = [
            workspaceId,
            resource,
            filters?.accountId ?? null,
            filters?.kind ?? null,
            filters?.status ?? null,
            filters?.month ?? null,
            filters?.voided ?? null,
            filters?.search
              ? `%${filters.search.replace(/[\\%_]/g, '\\$&')}%`
              : null,
          ];
          const rows = await client.query<{ data: unknown }>(
            `SELECT data FROM finance_records WHERE ${where} ORDER BY COALESCE(data->>'occurredOn',data->>'createdAt') DESC,id DESC LIMIT $9 OFFSET $10`,
            [...values, limit, offset],
          );
          const count = await client.query<{ total: number }>(
            `SELECT count(*)::integer AS total FROM finance_records WHERE ${where}`,
            values,
          );
          return {
            items: rows.rows.map((r) =>
              FinanceRecordSchemas[resource].parse(r.data),
            ),
            total: count.rows[0]!.total,
            limit,
            offset,
          };
        },
        list: async <K extends FinanceResource>(
          resource: K,
        ): Promise<FinanceRecordMap[K][]> => {
          const rows = await client.query<{ data: unknown }>(
            'SELECT data FROM finance_records WHERE workspace_id = $1 AND resource = $2 ORDER BY id',
            [workspaceId, resource],
          );
          // Each schema is indexed by its collection; stored JSON is parsed too.
          return rows.rows.map(
            (row) =>
              FinanceRecordSchemas[resource].parse(
                row.data,
              ) as FinanceRecordMap[K],
          );
        },
        save: async (resource, value, previous, operationId, reason) => {
          if (previous) {
            const updated = await client.query(
              'UPDATE finance_records SET data = $1, version = $2 WHERE workspace_id = $3 AND resource = $4 AND id = $5 AND version = $6',
              [
                JSON.stringify(value),
                value.version,
                workspaceId,
                resource,
                value.id,
                previous.version,
              ],
            );
            if (updated.rowCount !== 1)
              throw new ConflictException('Record changed. Reload and retry.');
          } else {
            await client.query(
              'INSERT INTO finance_records (workspace_id, resource, id, version, data) VALUES ($1,$2,$3,$4,$5)',
              [
                workspaceId,
                resource,
                value.id,
                value.version,
                JSON.stringify(value),
              ],
            );
          }
          await client.query(
            'INSERT INTO finance_audit (workspace_id, actor_id, operation_id, resource, entity_id, "before", "after", reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [
              workspaceId,
              actorId,
              operationId,
              resource,
              value.id,
              previous ? JSON.stringify(previous) : null,
              JSON.stringify(value),
              reason ?? null,
            ],
          );
        },
        operation: async (operationId) => {
          const rows = await client.query<{
            fingerprint: string;
            result: unknown;
          }>(
            'SELECT fingerprint, result FROM finance_operations WHERE workspace_id=$1 AND actor_id=$2 AND operation_id=$3',
            [workspaceId, actorId, operationId],
          );
          return rows.rows[0] ?? null;
        },
        remember: async (operationId, fingerprint, result) => {
          await client.query(
            'INSERT INTO finance_operations (workspace_id, actor_id, operation_id, fingerprint, result) VALUES ($1,$2,$3,$4,$5)',
            [
              workspaceId,
              actorId,
              operationId,
              fingerprint,
              JSON.stringify(result),
            ],
          );
        },
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
