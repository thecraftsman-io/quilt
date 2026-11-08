import { createStore } from 'zustand/vanilla';
import type { ThemePreference } from '@quilt/ui/tokens';
import type { Household, QuiltClient, Session } from '../lib/client';
import type { AuthOutcome } from '../lib/client/auth';

type Status = 'idle' | 'loading' | 'ready' | 'error';
export interface AppState {
  appearance: ThemePreference;
  session: Session | null;
  sessionStatus: Status;
  sessionError: string | null;
  authPending: boolean;
  households: Household[];
  activeHouseholdId: string | null;
  selectHousehold: (id: string) => Promise<void>;
  householdsStatus: Status;
  householdsError: string | null;
  householdPending: boolean;
  verificationEmail: string | null;
  verificationStatus:
    'idle' | 'sending' | 'sent' | 'verifying' | 'verified' | 'error';
  verificationError: string | null;
  verificationResendAt: number;
  resendVerification: (email: string) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  setAppearance: (appearance: ThemePreference) => void;
  refreshSession: () => Promise<void>;
  signIn: QuiltClient['auth']['signIn'];
  register: QuiltClient['auth']['register'];
  signOut: () => Promise<void>;
  loadHouseholds: () => Promise<void>;
  createHousehold: (name: string) => Promise<Household | null>;
}

export function createAppStore(client: QuiltClient) {
  let epoch = 0;
  let householdRevision = 0;
  let refresh: { epoch: number; promise: Promise<void> } | undefined;
  return createStore<AppState>()((set, get) => {
    const emptyHouseholds = {
      households: [],
      activeHouseholdId: null,
      householdsStatus: 'idle' as const,
      householdsError: null,
      householdPending: false,
    };
    const authenticate = async (request: () => Promise<AuthOutcome>) => {
      if (get().authPending)
        throw new Error('An account request is already in progress.');
      ++epoch;
      set({ authPending: true });
      try {
        const outcome = await request();
        if (outcome.status === 'verification-required') {
          set({
            session: null,
            sessionStatus: 'ready',
            sessionError: null,
            verificationEmail: outcome.email,
            verificationStatus: 'idle',
            verificationError: null,
            verificationResendAt: outcome.verificationEmailSent
              ? Date.now() + 60000
              : 0,
            ...emptyHouseholds,
          });
        } else {
          set({
            session: outcome.session,
            sessionStatus: 'ready',
            sessionError: null,
            verificationEmail: null,
            verificationStatus: 'idle',
            verificationError: null,
            verificationResendAt: 0,
            ...emptyHouseholds,
          });
          void get().loadHouseholds();
        }
        return outcome;
      } finally {
        set({ authPending: false });
      }
    };
    return {
      verificationEmail: null,
      verificationStatus: 'idle',
      verificationError: null,
      verificationResendAt: 0,
      appearance: 'system',
      session: null,
      sessionStatus: 'idle',
      sessionError: null,
      authPending: false,
      ...emptyHouseholds,
      setAppearance: (appearance) => set({ appearance }),
      refreshSession: () => {
        if (get().authPending) return Promise.resolve();
        if (refresh?.epoch === epoch) return refresh.promise;
        const started = epoch;
        const promise = (async () => {
          if (get().sessionStatus === 'idle') set({ sessionStatus: 'loading' });
          try {
            const restored = await client.auth.getSession();
            const session = restored?.user.emailVerified ? restored : null;
            if (started !== epoch) return;
            const changed = session?.user.id !== get().session?.user.id;
            set({
              session,
              sessionStatus: 'ready',
              sessionError: null,
              ...(restored && !restored.user.emailVerified
                ? { verificationEmail: restored.user.email }
                : {}),
              ...(changed || !session ? emptyHouseholds : {}),
            });
            if (session && (changed || get().householdsStatus === 'idle'))
              void get().loadHouseholds();
          } catch {
            if (started === epoch)
              set({
                session: null,
                sessionStatus: 'error',
                sessionError:
                  'We couldn’t reconnect to Quilt. Check your connection and try again.',
                ...emptyHouseholds,
              });
          }
        })();
        refresh = { epoch: started, promise };
        void promise.finally(() => {
          if (refresh?.promise === promise) refresh = undefined;
        });
        return promise;
      },
      signIn: (input) => authenticate(() => client.auth.signIn(input)),
      register: (input) => authenticate(() => client.auth.register(input)),
      signOut: async () => {
        if (get().authPending) return;
        ++epoch;
        set({ authPending: true });
        try {
          await client.auth.signOut();
          set({
            session: null,
            verificationEmail: null,
            verificationStatus: 'idle',
            verificationError: null,
            verificationResendAt: 0,
            sessionStatus: 'ready',
            sessionError: null,
            ...emptyHouseholds,
          });
        } finally {
          set({ authPending: false });
        }
      },
      resendVerification: async (email) => {
        if (
          get().verificationStatus === 'sending' ||
          get().verificationStatus === 'verifying' ||
          Date.now() < get().verificationResendAt
        )
          return;
        const started = epoch;
        set({
          verificationStatus: 'sending',
          verificationError: null,
          verificationEmail: email,
        });
        try {
          await client.auth.resendVerification(email);
          if (started === epoch)
            set({
              verificationStatus: 'sent',
              verificationResendAt: Date.now() + 60000,
            });
        } catch {
          if (started === epoch)
            set({
              verificationStatus: 'error',
              verificationError:
                'We couldn’t send the email. Please wait a moment and try again.',
            });
        }
      },
      verifyEmail: async (token) => {
        if (
          get().verificationStatus === 'sending' ||
          get().verificationStatus === 'verifying'
        )
          return;
        const started = epoch;
        set({ verificationStatus: 'verifying', verificationError: null });
        try {
          await client.auth.verifyEmail(token);
          if (started === epoch)
            set({ verificationStatus: 'verified', verificationEmail: null });
        } catch {
          if (started === epoch)
            set({
              verificationStatus: 'error',
              verificationError:
                'This link is invalid or has expired. Request a fresh one below.',
            });
        }
      },
      loadHouseholds: async () => {
        const userId = get().session?.user.id;
        if (!userId) return;
        const started = epoch;
        const revision = ++householdRevision;
        set({ householdsStatus: 'loading', householdsError: null });
        try {
          let households = await client.households.list();
          if (started !== epoch || revision !== householdRevision) return;
          if (!households.length) {
            households = [await client.households.ensureDefault()];
          }
          households.sort(
            (a, b) =>
              a.createdAt.getTime() - b.createdAt.getTime() ||
              a.id.localeCompare(b.id),
          );
          if (
            started === epoch &&
            revision === householdRevision &&
            userId === get().session?.user.id
          )
            set({
              households,
              householdsStatus: 'ready',
              activeHouseholdId:
                households.find((h) => h.id === get().activeHouseholdId)?.id ??
                households.find(
                  (h) => h.id === get().session?.session.activeOrganizationId,
                )?.id ??
                households[0]!.id,
            });
        } catch {
          if (started === epoch && revision === householdRevision)
            set({
              householdsStatus: 'error',
              householdsError:
                'We couldn’t load your households. Please try again.',
            });
        }
      },
      selectHousehold: async (id) => {
        if (!get().session || !get().households.some((h) => h.id === id))
          throw new Error(
            'This household is no longer available. Refresh and try again.',
          );
        const started = epoch;
        await client.households.setActive(id);
        if (started === epoch) {
          const session = get().session;
          if (session)
            set({
              activeHouseholdId: id,
              session: {
                ...session,
                session: { ...session.session, activeOrganizationId: id },
              },
            });
        }
      },
      createHousehold: async (name) => {
        if (!get().session || get().householdPending) return null;
        const started = epoch;
        set({ householdPending: true });
        try {
          const household = await client.households.create(name);
          if (started === epoch) {
            ++householdRevision;
            set({
              households: [
                ...get().households.filter((item) => item.id !== household.id),
                household,
              ],
              householdsStatus: 'ready',
              householdsError: null,
            });
            return household;
          }
          return null;
        } finally {
          if (started === epoch) set({ householdPending: false });
        }
      },
    };
  });
}
