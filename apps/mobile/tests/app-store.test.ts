import { describe, it, expect } from 'vitest';
import { createAppStore } from '../src/state/create-app-store';
import type { Household, Session } from '../src/lib/client';
import { createAuthApi } from '../src/lib/client/auth';
import type { RawAuthClient } from '../src/lib/client/auth-client';
import { ClientError } from '../src/lib/client/errors';

describe('AppStore', () => {
  const session: Session = {
    user: {
      id: 'person-a',
      name: 'Alex',
      email: 'alex@example.com',
      emailVerified: true,
      createdAt: new Date('2026-11-05T00:00:00.000Z'),
      updatedAt: new Date('2026-11-05T00:00:00.000Z'),
    },
    session: {
      id: 'session-a',
      userId: 'person-a',
      expiresAt: new Date('2026-11-12T00:00:00.000Z'),
      createdAt: new Date('2026-11-05T00:00:00.000Z'),
      updatedAt: new Date('2026-11-05T00:00:00.000Z'),
    },
  };

  const household: Household = {
    id: 'home-a',
    name: 'Our place',
    slug: 'our-place',
    createdAt: new Date('2026-11-05T00:00:00.000Z'),
  };

  function fakeClient(overrides: Record<string, unknown> = {}) {
    const authOverrides = (overrides.auth as Record<string, unknown>) ?? {};
    const householdOverrides =
      (overrides.households as Record<string, unknown>) ?? {};

    return {
      auth: {
        getSession: () => Promise.resolve(session),
        requireSession: () => Promise.resolve(session),
        signIn: () => Promise.resolve({ status: 'authenticated', session }),
        register: (input: { email: string }) =>
          Promise.resolve({
            status: 'verification-required',
            email: input.email,
          }),
        resendVerification: () => Promise.resolve(),
        verifyEmail: () => Promise.resolve(),
        signOut: () => Promise.resolve(),
        subscribe: () => () => {},
        ...authOverrides,
      },
      households: {
        ensureDefault: () => Promise.resolve(household),
        setActive: () => Promise.resolve(),
        list: () => Promise.resolve([household]),
        create: (name: string) => Promise.resolve({ ...household, name }),
        ...householdOverrides,
      },
    } as Parameters<typeof createAppStore>[0];
  }

  it('restoration and sign-out keep session and household state together', async () => {
    const store = createAppStore(fakeClient());
    await store.getState().refreshSession();
    await store.getState().loadHouseholds();
    expect(store.getState().session).toEqual(session);
    expect(store.getState().households).toEqual([household]);
    store.getState().setAppearance('dark');
    await store.getState().signOut();
    expect(store.getState().session).toBeNull();
    expect(store.getState().households).toEqual([]);
    expect(store.getState().appearance).toBe('dark');
  });

  it('opens a default household automatically for a user with none', async () => {
    let setups = 0;
    const store = createAppStore(
      fakeClient({
        households: {
          list: () => Promise.resolve([]),
          ensureDefault: () => {
            setups++;
            return Promise.resolve(household);
          },
        },
      }),
    );
    await store
      .getState()
      .signIn({ email: 'alex@example.com', password: 'password' });
    await store.getState().loadHouseholds();
    expect(setups).toBeGreaterThan(0);
    expect(store.getState().activeHouseholdId).toBe(household.id);
    expect(store.getState().householdsStatus).toBe('ready');
  });

  it('reuses existing households and restores the active household from the session', async () => {
    const other = { ...household, id: 'other', name: 'Other' };
    let setups = 0;
    const store = createAppStore(
      fakeClient({
        auth: {
          getSession: () =>
            Promise.resolve({
              ...session,
              session: { ...session.session, activeOrganizationId: other.id },
            }),
        },
        households: {
          list: () => Promise.resolve([household, other]),
          ensureDefault: () => {
            setups++;
            return Promise.resolve(household);
          },
        },
      }),
    );
    await store.getState().refreshSession();
    await store.getState().loadHouseholds();
    expect(store.getState().activeHouseholdId).toBe(other.id);
    expect(setups).toBe(0);
    await store.getState().selectHousehold(household.id);
    expect(store.getState().session?.session.activeOrganizationId).toBe(
      household.id,
    );
    await store.getState().loadHouseholds();
    expect(store.getState().activeHouseholdId).toBe(household.id);
    await store.getState().signOut();
    expect(store.getState().activeHouseholdId).toBeNull();
  });

  it('falls back when the remembered household is no longer accessible', async () => {
    const store = createAppStore(
      fakeClient({
        auth: {
          getSession: () =>
            Promise.resolve({
              ...session,
              session: { ...session.session, activeOrganizationId: 'removed' },
            }),
        },
      }),
    );
    await store.getState().refreshSession();
    await store.getState().loadHouseholds();
    expect(store.getState().activeHouseholdId).toBe(household.id);
    await expect(store.getState().selectHousehold('removed')).rejects.toThrow();
  });

  it('a default setup failure stays recoverable instead of opening an empty household', async () => {
    const store = createAppStore(
      fakeClient({
        households: {
          list: () => Promise.resolve([]),
          ensureDefault: () => Promise.reject(new Error('Unavailable')),
        },
      }),
    );
    await store
      .getState()
      .signIn({ email: 'alex@example.com', password: 'password' });
    await store.getState().loadHouseholds();
    expect(store.getState().householdsStatus).toBe('error');
    expect(store.getState().activeHouseholdId).toBeNull();
  });

  it('a setup response cannot restore a household after sign-out', async () => {
    let finish!: (value: Household) => void;
    const setup = new Promise<Household>((resolve) => {
      finish = resolve;
    });
    const store = createAppStore(
      fakeClient({
        households: {
          list: () => Promise.resolve([]),
          ensureDefault: () => setup,
        },
      }),
    );
    await store
      .getState()
      .signIn({ email: 'alex@example.com', password: 'password' });
    const loading = store.getState().loadHouseholds();
    await Promise.resolve();
    await store.getState().signOut();
    finish(household);
    await loading;
    expect(store.getState().activeHouseholdId).toBeNull();
    expect(store.getState().households).toEqual([]);
  });

  it('a stale session response cannot sign someone back in after sign-out', async () => {
    let resolveSession!: (s: Session) => void;
    const store = createAppStore(
      fakeClient({
        auth: {
          getSession: () =>
            new Promise<Session>((resolve) => {
              resolveSession = resolve;
            }),
        },
      }),
    );
    const restoring = store.getState().refreshSession();
    await store.getState().signOut();
    resolveSession(session);
    await restoring;
    expect(store.getState().session).toBeNull();
    expect(store.getState().sessionStatus).toBe('ready');
    expect(store.getState().households).toEqual([]);
  });

  it('rejected credentials leave the app signed out and release loading state', async () => {
    const store = createAppStore(
      fakeClient({
        auth: {
          signIn: () => Promise.reject(new Error('Invalid credentials')),
        },
      }),
    );
    await expect(
      store.getState().signIn({ email: 'alex@example.com', password: 'wrong' }),
    ).rejects.toThrow();
    expect(store.getState().session).toBeNull();
    expect(store.getState().authPending).toBe(false);
  });

  it('households requested by a previous user cannot populate a later session', async () => {
    let resolveList!: (h: Household[]) => void;
    const store = createAppStore(
      fakeClient({
        households: {
          list: () =>
            new Promise<Household[]>((resolve) => {
              resolveList = resolve;
            }),
        },
      }),
    );
    await store
      .getState()
      .signIn({ email: 'alex@example.com', password: 'password' });
    const loading = store.getState().loadHouseholds();
    await store.getState().signOut();
    resolveList([household]);
    await loading;
    expect(store.getState().households).toEqual([]);
  });

  it('failed sign-out keeps the existing session available for a retry', async () => {
    const store = createAppStore(
      fakeClient({
        auth: {
          signOut: () => Promise.reject(new Error('Offline')),
        },
      }),
    );
    await store
      .getState()
      .signIn({ email: 'alex@example.com', password: 'password' });
    await expect(store.getState().signOut()).rejects.toThrow();
    expect(store.getState().session).toEqual(session);
    expect(store.getState().authPending).toBe(false);
  });

  it('registration waits for verification and never loads a household', async () => {
    let lists = 0;
    const store = createAppStore(
      fakeClient({
        households: {
          list: () => {
            lists++;
            return Promise.resolve([]);
          },
        },
      }),
    );
    const outcome = await store.getState().register({
      name: 'Alex',
      email: 'alex@example.com',
      password: 'password',
    });
    expect(outcome.status).toBe('verification-required');
    expect(store.getState().session).toBeNull();
    expect(store.getState().verificationEmail).toBe('alex@example.com');
    expect(lists).toBe(0);
  });

  it('duplicate signup fails without entering the check-inbox flow', async () => {
    const auth = createAuthApi({
      signUp: {
        email: () =>
          Promise.resolve({
            data: null,
            error: {
              status: 422,
              code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
              message:
                'An account with this email already exists. Sign in instead.',
            },
          }),
      },
    } as unknown as RawAuthClient);
    const store = createAppStore(
      fakeClient({
        auth: {
          register: (input: Parameters<typeof auth.register>[0]) =>
            auth.register(input),
        },
      }),
    );

    await expect(
      store.getState().register({
        name: 'Alex',
        email: 'alex@example.com',
        password: 'Test-password-123!',
      }),
    ).rejects.toMatchObject({
      name: ClientError.name,
      code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
    });
    expect(store.getState().verificationEmail).toBeNull();
    expect(store.getState().verificationStatus).toBe('idle');
    expect(store.getState().authPending).toBe(false);
  });

  it('restored unverified sessions cannot expose household data', async () => {
    const store = createAppStore(
      fakeClient({
        auth: {
          getSession: () =>
            Promise.resolve({
              ...session,
              user: { ...session.user, emailVerified: false },
            }),
        },
      }),
    );
    await store.getState().refreshSession();
    expect(store.getState().session).toBeNull();
    expect(store.getState().verificationEmail).toBe(session.user.email);
    expect(store.getState().households).toEqual([]);
  });

  it('resends share a cooldown and verification does not manufacture a session', async () => {
    let sends = 0;
    const store = createAppStore(
      fakeClient({
        auth: {
          resendVerification: () => {
            sends++;
            return Promise.resolve();
          },
        },
      }),
    );
    await store.getState().resendVerification('alex@example.com');
    await store.getState().resendVerification('alex@example.com');
    expect(sends).toBe(1);
    expect(store.getState().verificationStatus).toBe('sent');
    await store.getState().verifyEmail('test-token');
    expect(store.getState().verificationStatus).toBe('verified');
    expect(store.getState().session).toBeNull();
  });

  it('invalid verification links surface a recoverable error', async () => {
    const store = createAppStore(
      fakeClient({
        auth: {
          verifyEmail: () => Promise.reject(new Error('expired')),
        },
      }),
    );
    await store.getState().verifyEmail('expired-token');
    expect(store.getState().verificationStatus).toBe('error');
    expect(store.getState().verificationError).toMatch(/expired/);
    expect(store.getState().session).toBeNull();
  });
});
