import { z } from 'zod';

const booleanEnv = z.preprocess(
  (value) => (value === 'true' ? true : value === 'false' ? false : value),
  z.boolean(),
);

export const EnvSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .optional(),
    CORS_ORIGINS: z.string({
      error: 'CORS_ORIGINS is required',
    }),
    DATABASE_URL: z.string({
      error: 'DATABASE_URL is required',
    }),
    REDIS_URL: z.string().optional(),
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
    BETTER_AUTH_URL: z.url({
      error: 'BETTER_AUTH_URL is required',
    }),
    BETTER_AUTH_SECRET: z
      .string({
        error: 'BETTER_AUTH_SECRET is required',
      })
      .min(16, 'BETTER_AUTH_SECRET must be at least 16 characters'),
    APP_URL: z.url({
      error: 'APP_URL is required',
    }),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    SMTP_SECURE: booleanEnv.default(false),
    SMTP_REQUIRE_TLS: booleanEnv.optional(),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    MAIL_FROM: z.email().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_USER'],
        message: 'SMTP_USER and SMTP_PASSWORD must be configured together',
      });
    }

    if (env.SMTP_HOST && !env.MAIL_FROM) {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_FROM'],
        message: 'MAIL_FROM is required when SMTP_HOST is configured',
      });
    }

    if (!['https:', 'http:'].includes(new URL(env.APP_URL).protocol)) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_URL'],
        message: 'APP_URL must use HTTP or HTTPS',
      });
    }

    if (!['https:', 'http:'].includes(new URL(env.BETTER_AUTH_URL).protocol)) {
      ctx.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_URL'],
        message: 'BETTER_AUTH_URL must use HTTP or HTTPS',
      });
    }

    if (env.NODE_ENV === 'production') {
      for (const key of ['SMTP_HOST', 'MAIL_FROM'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required in production`,
          });
        }
      }
      if (!env.APP_URL.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['APP_URL'],
          message: 'APP_URL must use HTTPS in production',
        });
      }
      if (!env.BETTER_AUTH_URL.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['BETTER_AUTH_URL'],
          message: 'BETTER_AUTH_URL must use HTTPS in production',
        });
      }
      if (env.SMTP_REQUIRE_TLS === false && !env.SMTP_SECURE) {
        ctx.addIssue({
          code: 'custom',
          path: ['SMTP_REQUIRE_TLS'],
          message: 'SMTP must use TLS in production',
        });
      }
    }
  })
  .transform((env) => ({
    ...env,
    SMTP_PORT:
      env.SMTP_PORT ??
      (env.SMTP_HOST
        ? env.SMTP_SECURE
          ? 465
          : env.NODE_ENV === 'production'
            ? 587
            : 1025
        : undefined),
    SMTP_REQUIRE_TLS:
      env.SMTP_REQUIRE_TLS ??
      (env.SMTP_HOST ? env.NODE_ENV === 'production' : undefined),
    REDIS_URL:
      env.REDIS_URL && env.REDIS_URL.trim().length > 0
        ? env.REDIS_URL
        : `redis://${env.REDIS_HOST}:${env.REDIS_PORT}`,
    CORS_ORIGIN_LIST: env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  }));

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    const errorMessages = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(
      `\n❌ Invalid environment variables at startup:\n${errorMessages.join('\n')}\n\nPlease check your .env configuration.\n`,
    );
  }
  return result.data;
}
