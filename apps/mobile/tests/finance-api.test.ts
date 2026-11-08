import { describe, expect, it, vi } from 'vitest';
import {
  createFinanceApi,
  type FinanceFetch,
} from '../src/lib/client/finance-api';
import { ClientError } from '../src/lib/client/errors';

const record = {
  id: 'account-1',
  workspaceId: 'home-1',
  version: 1,
  createdAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z',
  createdBy: 'user-1',
  updatedBy: 'user-1',
  name: 'Cash',
  kind: 'cash',
  currency: 'EUR',
  openingBalance: { amount: '0', currency: 'EUR' },
  openingBalanceDate: '2026-01-01',
  archivedAt: null,
};
const payload = {
  name: 'Cash',
  kind: 'cash',
  currency: 'EUR',
  openingBalance: { amount: '0', currency: 'EUR' },
  openingBalanceDate: '2026-01-01',
  archived: false,
};
const operationId = '9ae02727-f694-4c5c-b947-0f44be5a79b6';
describe('Finance API client', () => {
  it('sends authenticated JSON commands and preserves retry IDs', async () => {
    const fetcher = vi
      .fn<FinanceFetch>()
      .mockImplementation(() => Promise.resolve(Response.json(record)));
    const api = createFinanceApi({
      baseUrl: 'http://quilt.test/',
      headers: () => Promise.resolve({ Cookie: 'test-session=synthetic' }),
      fetch: fetcher,
    });
    await api.create('home-1', 'accounts', payload, operationId);
    await api.create('home-1', 'accounts', payload, operationId);
    for (const [url, options] of fetcher.mock.calls) {
      expect(url).toBe('http://quilt.test/api/workspaces/home-1/accounts');
      expect(options).toMatchObject({
        method: 'POST',
        credentials: 'include',
        headers: {
          Cookie: 'test-session=synthetic',
          'content-type': 'application/json',
        },
      });
      expect(
        JSON.parse(typeof options.body === 'string' ? options.body : ''),
      ).toMatchObject({
        operationId,
        data: payload,
      });
    }
  });
  it('uses server pagination and safely encodes search values', async () => {
    const fetcher = vi
      .fn<FinanceFetch>()
      .mockResolvedValue(
        Response.json({ items: [record], total: 1, limit: 50, offset: 0 }),
      );
    const api = createFinanceApi({
      baseUrl: 'http://quilt.test',
      fetch: fetcher,
    });
    const page = await api.list('home-1', 'accounts', {
      limit: 50,
      offset: 0,
      search: 'a&b',
    });
    expect(page.items[0]?.openingBalance.amount).toBe('0');
    expect(
      new URL(fetcher.mock.calls[0]?.[0] ?? '').searchParams.get('search'),
    ).toBe('a&b');
  });
  it('loads every reference page without treating one page as complete', async () => {
    const fetcher = vi
      .fn<FinanceFetch>()
      .mockResolvedValueOnce(
        Response.json({ items: [record], total: 2, limit: 100, offset: 0 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [{ ...record, id: 'account-2' }],
          total: 2,
          limit: 100,
          offset: 1,
        }),
      );
    const api = createFinanceApi({
      baseUrl: 'http://quilt.test',
      fetch: fetcher,
    });
    expect((await api.all('home-1', 'accounts')).map((r) => r.id)).toEqual([
      'account-1',
      'account-2',
    ]);
    expect(
      new URL(fetcher.mock.calls[1]?.[0] ?? '').searchParams.get('offset'),
    ).toBe('1');
  });
  it('rejects client-owned metadata before any write reaches the network', async () => {
    const fetcher = vi.fn<FinanceFetch>();
    const api = createFinanceApi({
      baseUrl: 'http://quilt.test',
      fetch: fetcher,
    });
    await expect(
      api.create(
        'home-1',
        'accounts',
        { ...payload, workspaceId: 'foreign' },
        operationId,
      ),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps permission and conflict failures distinct from successful saves', async () => {
    const fetcher = vi
      .fn<FinanceFetch>()
      .mockResolvedValue(
        Response.json(
          { statusCode: 403, message: 'Access denied.', code: 'FORBIDDEN' },
          { status: 403 },
        ),
      );
    const api = createFinanceApi({
      baseUrl: 'http://quilt.test',
      fetch: fetcher,
    });
    await expect(
      api.create('home-1', 'accounts', payload, operationId),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    fetcher.mockResolvedValue(
      Response.json(
        { statusCode: 409, message: 'Record changed.', currentVersion: 2 },
        { status: 409 },
      ),
    );
    await expect(
      api.update('home-1', 'accounts', 'account-1', 1, payload, operationId),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('never substitutes sample data after a failed request or invalid response', async () => {
    const fetcher = vi
      .fn<FinanceFetch>()
      .mockRejectedValue(new TypeError('Offline'));
    const api = createFinanceApi({
      baseUrl: 'http://quilt.test',
      fetch: fetcher,
    });
    await expect(api.access('home-1')).rejects.toBeInstanceOf(ClientError);
    fetcher.mockResolvedValue(Response.json({ unexpected: true }));
    await expect(
      api.get('home-1', 'accounts', 'account-1'),
    ).rejects.toBeInstanceOf(ClientError);
  });
});
