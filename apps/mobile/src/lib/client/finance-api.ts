import { z } from 'zod';
import {
  ApiErrorResponseSchema,
  BudgetProgressSchema,
  FinanceDataSchemas,
  FinanceRecordSchemas,
  FinanceSummarySchema,
  GoalProgressSchema,
  WorkspaceAccessSchema,
  type FinanceRecordMap,
  type FinanceResource,
  type FinanceListQuery,
} from '@quilt/contracts';
import { ClientError } from './errors';

export type FinanceFetch = (
  url: string,
  options: RequestInit,
) => Promise<Response>;

export function createFinanceApi(options: {
  baseUrl: string;
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  fetch?: FinanceFetch;
}) {
  const fetcher = options.fetch ?? fetch;
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    method = 'GET',
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(abort, 15000);
    try {
      const response = await fetcher(
        `${options.baseUrl.replace(/\/$/, '')}/api${path}`,
        {
          method,
          credentials: 'include',
          headers: {
            ...(await options.headers?.()),
            ...(body !== undefined
              ? { 'content-type': 'application/json' }
              : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
          cache: 'no-store',
        },
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        const error = ApiErrorResponseSchema.safeParse(payload);
        throw new ClientError(
          error.success
            ? error.data.message
            : 'The request could not be completed.',
          response.status,
          error.success ? error.data.code : undefined,
        );
      }
      return schema.parse(payload);
    } catch (error) {
      if (error instanceof ClientError) throw error;
      if (error instanceof z.ZodError)
        throw new ClientError(
          'The server returned data Quilt could not read. Refresh and try again.',
        );
      if (signal?.aborted) throw error;
      throw new ClientError(
        'We couldn’t reach Quilt. Check your connection and try again.',
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
  const root = (workspace: string) =>
    `/workspaces/${encodeURIComponent(workspace)}`;
  const item = (workspace: string, resource: FinanceResource, id: string) =>
    `${root(workspace)}/${resource}/${encodeURIComponent(id)}`;
  const parseRecord = <K extends FinanceResource>(resource: K) =>
    z
      .unknown()
      .transform(
        (value) =>
          FinanceRecordSchemas[resource].parse(value) as FinanceRecordMap[K],
      );
  return {
    access: (workspace: string, signal?: AbortSignal) =>
      request(
        `${root(workspace)}/access`,
        WorkspaceAccessSchema,
        'GET',
        undefined,
        signal,
      ),
    async list<K extends FinanceResource>(
      workspace: string,
      resource: K,
      query: Partial<FinanceListQuery> = {},
      signal?: AbortSignal,
    ) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query))
        if (value !== undefined && value !== '') params.set(key, String(value));
      return request(
        `${root(workspace)}/${resource}?${params}`,
        z.object({
          items: z.array(parseRecord(resource)),
          total: z.number().int().nonnegative(),
          limit: z.number().int().positive(),
          offset: z.number().int().nonnegative(),
        }),
        'GET',
        undefined,
        signal,
      );
    },
    async all<K extends FinanceResource>(
      workspace: string,
      resource: K,
      signal?: AbortSignal,
    ): Promise<FinanceRecordMap[K][]> {
      const records = new Map<string, FinanceRecordMap[K]>();
      let offset = 0;
      while (true) {
        const page = await this.list(
          workspace,
          resource,
          { limit: 100, offset },
          signal,
        );
        for (const record of page.items) records.set(record.id, record);
        if (offset + page.items.length >= page.total) break;
        if (!page.items.length || offset >= 100000)
          throw new ClientError(
            'This collection is too large to load. Please try again later.',
          );
        offset += page.items.length;
      }
      return [...records.values()];
    },
    get: <K extends FinanceResource>(
      workspace: string,
      resource: K,
      id: string,
      signal?: AbortSignal,
    ) =>
      request(
        item(workspace, resource, id),
        parseRecord(resource),
        'GET',
        undefined,
        signal,
      ),
    create: async <K extends FinanceResource>(
      workspace: string,
      resource: K,
      data: unknown,
      operationId: string,
    ) =>
      request(`${root(workspace)}/${resource}`, parseRecord(resource), 'POST', {
        operationId,
        data: FinanceDataSchemas[resource].parse(data),
      }),
    update: async <K extends Exclude<FinanceResource, 'contributions'>>(
      workspace: string,
      resource: K,
      id: string,
      expectedVersion: number,
      data: unknown,
      operationId: string,
    ) =>
      request(item(workspace, resource, id), parseRecord(resource), 'PUT', {
        operationId,
        expectedVersion,
        data: FinanceDataSchemas[resource].parse(data),
      }),
    transactionState: (
      workspace: string,
      id: string,
      expectedVersion: number,
      action: 'void' | 'restore',
      reason: string,
      operationId: string,
    ) =>
      request(
        `${item(workspace, 'transactions', id)}/${action}`,
        FinanceRecordSchemas.transactions,
        'POST',
        { expectedVersion, reason, operationId },
      ),
    summary: (
      workspace: string,
      month: string,
      currency: string,
      asOf: string,
      signal?: AbortSignal,
    ) =>
      request(
        `${root(workspace)}/summary?${new URLSearchParams({ month, currency, asOf })}`,
        FinanceSummarySchema,
        'GET',
        undefined,
        signal,
      ),
    goalProgress: (
      workspace: string,
      id: string,
      asOf: string,
      signal?: AbortSignal,
    ) =>
      request(
        `${item(workspace, 'goals', id)}/progress?${new URLSearchParams({ asOf })}`,
        GoalProgressSchema,
        'GET',
        undefined,
        signal,
      ),
    budgetProgress: (
      workspace: string,
      id: string,
      asOf: string,
      signal?: AbortSignal,
    ) =>
      request(
        `${item(workspace, 'budgets', id)}/progress?${new URLSearchParams({ asOf })}`,
        BudgetProgressSchema,
        'GET',
        undefined,
        signal,
      ),
  };
}
export type FinanceApi = ReturnType<typeof createFinanceApi>;
