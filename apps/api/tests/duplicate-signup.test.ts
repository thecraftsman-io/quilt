import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryAdapter } from 'better-auth/adapters/memory';
import type { Database } from '@quilt/db';
import { createAuth } from '../src/auth/auth';

const { data } = vi.hoisted(() => ({
  data: { user: [], session: [], account: [], verification: [] } as Record<
    string,
    Record<string, unknown>[]
  >,
}));

// Keep the real auth routes and account logic; replace only database storage.
vi.mock('@better-auth/drizzle-adapter', () => ({
  drizzleAdapter: () => memoryAdapter(data),
}));

describe('duplicate email signup', () => {
  beforeEach(() => {
    for (const table of Object.values(data)) table.length = 0;
  });

  it.each([false, true])(
    'rejects an existing account (emailVerified=%s) instead of reporting signup success',
    async (emailVerified) => {
      const sendVerificationEmail = vi.fn(async () => {});
      const auth = createAuth({} as Database, {
        baseURL: 'http://localhost:3000',
        secret: 'duplicate-signup-test-secret-at-least-32-characters',
        sendVerificationEmail,
      });
      // Isolate account behavior from the process-wide rate-limit cache.
      auth.options.rateLimit = { enabled: false };
      const signup = (email: string) =>
        auth.handler(
          new Request('http://localhost:3000/api/auth/sign-up/email', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              name: 'Alex',
              email,
              password: 'Test-password-123!',
            }),
          }),
        );
      const first = await signup('alex@example.com');
      expect(first.status).toBe(200);
      expect(sendVerificationEmail).toHaveBeenCalledOnce();
      data.user![0]!.emailVerified = emailVerified;

      const duplicate = await signup('Alex@Example.com');
      expect(duplicate.status).toBe(422);
      expect(await duplicate.json()).toMatchObject({
        code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
      });
      expect(sendVerificationEmail).toHaveBeenCalledOnce();
      expect(data.user).toHaveLength(1);
      expect(data.session).toHaveLength(0);
    },
  );
});
