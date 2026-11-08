import { describe, expect, it, vi } from 'vitest';
import { createAuthClient } from 'better-auth/client';
import { createHouseholdsApi } from '../src/lib/client/households';
import type { RawAuthClient } from '../src/lib/client/auth-client';

const household = {
  id: 'home-1',
  name: 'My household',
  slug: 'home-1',
  createdAt: '2026-11-08T10:00:00.000Z',
};

describe('household setup transport', () => {
  it('uses the authenticated API URL, not the auth-route prefix, and validates the result', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(Response.json(household, { status: 201 })),
    );
    const raw = createAuthClient({
      baseURL: 'http://quilt.test',
      fetchOptions: { customFetchImpl: fetcher },
    });
    const api = createHouseholdsApi(
      raw as unknown as RawAuthClient,
      'http://quilt.test/',
    );
    expect(await api.ensureDefault()).toEqual({
      ...household,
      createdAt: new Date(household.createdAt),
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0]! as unknown as [
      string,
      RequestInit,
    ];
    expect(String(url)).toBe('http://quilt.test/api/organizations/default');
    expect(options).toMatchObject({ method: 'POST', credentials: 'include' });
  });

  it('propagates setup failures instead of reporting a household was created', async () => {
    const raw = createAuthClient({
      baseURL: 'http://quilt.test',
      fetchOptions: {
        customFetchImpl: () =>
          Promise.resolve(
            Response.json(
              { message: 'Verification required' },
              { status: 403 },
            ),
          ),
      },
    });
    const api = createHouseholdsApi(
      raw as unknown as RawAuthClient,
      'http://quilt.test',
    );
    await expect(api.ensureDefault()).rejects.toMatchObject({ status: 403 });
  });
});
