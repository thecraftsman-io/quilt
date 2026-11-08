import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { expo } from '@better-auth/expo';
import { PasswordSchema } from '@quilt/contracts';
import type { Database } from '@quilt/db';
import { schema } from '@quilt/db';
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import { memberAc, ownerAc } from 'better-auth/plugins/organization/access';
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api';
import type { RedisService } from '../redis/redis.service';

export interface AuthConfigOptions {
  baseURL?: string;
  secret: string;
  trustedOrigins?: string[];
  githubClientId?: string;
  githubClientSecret?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  redisService?: RedisService;
  sendVerificationEmail: (input: {
    email: string;
    name: string;
    token: string;
  }) => Promise<void>;
}

export function createAuth(db: Database, options: AuthConfigOptions) {
  const baseURL =
    options.baseURL || process.env.BETTER_AUTH_URL || 'http://localhost:3000';
  const secret = options.secret || process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET is required');
  }

  const socialProviders: Record<
    string,
    { clientId: string; clientSecret: string }
  > = {};

  const githubClientId = options.githubClientId || process.env.GITHUB_CLIENT_ID;
  const githubClientSecret =
    options.githubClientSecret || process.env.GITHUB_CLIENT_SECRET;
  if (githubClientId && githubClientSecret) {
    socialProviders.github = {
      clientId: githubClientId,
      clientSecret: githubClientSecret,
    };
  }

  const googleClientId = options.googleClientId || process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret =
    options.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET;
  if (googleClientId && googleClientSecret) {
    socialProviders.google = {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    };
  }

  const secondaryStorage = options.redisService
    ? {
        get: (key: string) => options.redisService!.get(key),
        set: (key: string, value: string, ttl?: number) =>
          options.redisService!.set(key, value, ttl),
        delete: (key: string) => options.redisService!.del(key),
        getAndDelete: (key: string) => options.redisService!.getAndDelete(key),
        increment: (key: string, ttl?: number) =>
          options.redisService!.increment(key, ttl),
      }
    : undefined;

  return betterAuth({
    baseURL,
    basePath: '/api/auth',
    secret,
    trustedOrigins: [...(options.trustedOrigins ?? []), 'quilt://'],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 10,
      maxPasswordLength: 128,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
      sendVerificationEmail: ({ user, token }) =>
        options.sendVerificationEmail({
          email: user.email,
          name: user.name,
          token,
        }),
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/sign-up/email') {
          const body = ctx.body as { password?: unknown };
          if (typeof body?.password === 'string') {
            const result = PasswordSchema.safeParse(body.password);
            if (!result.success) {
              throw new APIError('BAD_REQUEST', {
                code: 'INVALID_PASSWORD',
                message:
                  result.error.issues[0]?.message ??
                  'Password does not meet complexity requirements.',
              });
            }
          }
        }
        if (ctx.path.startsWith('/organization/')) {
          if (
            [
              '/organization/invite-member',
              '/organization/update-member-role',
              '/organization/add-member',
            ].includes(ctx.path)
          ) {
            const body = ctx.body as { role?: unknown } | undefined;
            if (
              typeof body?.role !== 'string' ||
              !['owner', 'editor', 'viewer'].includes(body.role)
            )
              throw new APIError('BAD_REQUEST', {
                code: 'INVALID_ROLE',
                message: 'Choose owner, editor, or viewer.',
              });
          }
          const session = await getSessionFromCtx(ctx, {
            disableCookieCache: true,
          });
          if (session && !session.user.emailVerified)
            throw new APIError('FORBIDDEN', {
              code: 'EMAIL_NOT_VERIFIED',
              message: 'Confirm your email before accessing your household.',
            });
        }
      }),
    },
    socialProviders:
      Object.keys(socialProviders).length > 0 ? socialProviders : undefined,
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
    },
    rateLimit: {
      enabled: true,
      storage: secondaryStorage ? 'secondary-storage' : 'memory',
      customRules: {
        '/send-verification-email': { window: 60, max: 3 },
        '/verify-email': { window: 60, max: 10 },
      },
    },
    secondaryStorage,
    plugins: [
      organization({
        roles: {
          owner: ownerAc,
          editor: memberAc,
          viewer: memberAc,
          admin: memberAc,
          member: memberAc,
        },
      }),
      expo(),
    ],
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
