import { describe, it, expect } from 'vitest';
import { validateEnv } from '../src/config/env.schema';

describe('validateEnv', () => {
  const validConfig = {
    DATABASE_URL: 'postgresql://quilt:quilt@localhost:5432/quilt',
    BETTER_AUTH_SECRET: 'test-secret-at-least-16-characters-long',
    BETTER_AUTH_URL: 'http://localhost:3000',
    APP_URL: 'http://localhost:8081',
    PORT: '4000',
    CORS_ORIGINS: 'http://localhost:8081, http://localhost:3000',
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: '6380',
  };

  function withoutKey<K extends keyof typeof validConfig>(
    key: K,
  ): Omit<typeof validConfig, K> {
    const copy = { ...validConfig };
    delete copy[key];
    return copy;
  }

  it('accepts valid environment and generates computed fields', () => {
    const env = validateEnv(validConfig);

    expect(env.PORT).toBe(4000);
    expect(env.REDIS_URL).toBe('redis://127.0.0.1:6380');
    expect(env.CORS_ORIGIN_LIST).toEqual([
      'http://localhost:8081',
      'http://localhost:3000',
    ]);
    expect(env.DATABASE_URL).toBe(
      'postgresql://quilt:quilt@localhost:5432/quilt',
    );
    expect(env.BETTER_AUTH_SECRET).toBe(
      'test-secret-at-least-16-characters-long',
    );
    expect(env.BETTER_AUTH_URL).toBe('http://localhost:3000');
    expect(env.APP_URL).toBe('http://localhost:8081');
  });

  it('throws on missing required DATABASE_URL', () => {
    expect(() => validateEnv(withoutKey('DATABASE_URL'))).toThrow(
      /DATABASE_URL: DATABASE_URL is required/,
    );
  });

  it('throws on missing required BETTER_AUTH_SECRET', () => {
    expect(() => validateEnv(withoutKey('BETTER_AUTH_SECRET'))).toThrow(
      /BETTER_AUTH_SECRET: BETTER_AUTH_SECRET is required/,
    );
  });

  it('throws on short BETTER_AUTH_SECRET', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        BETTER_AUTH_SECRET: 'short',
      }),
    ).toThrow(/BETTER_AUTH_SECRET must be at least 16 characters/);
  });

  it('throws on missing required APP_URL', () => {
    expect(() => validateEnv(withoutKey('APP_URL'))).toThrow(
      /APP_URL: APP_URL is required/,
    );
  });

  it('throws on missing required BETTER_AUTH_URL', () => {
    expect(() => validateEnv(withoutKey('BETTER_AUTH_URL'))).toThrow(
      /BETTER_AUTH_URL: BETTER_AUTH_URL is required/,
    );
  });

  it('throws on missing required CORS_ORIGINS', () => {
    expect(() => validateEnv(withoutKey('CORS_ORIGINS'))).toThrow(
      /CORS_ORIGINS: CORS_ORIGINS is required/,
    );
  });

  it('throws on invalid port number', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        PORT: 'not-a-number',
      }),
    ).toThrow(/PORT: Invalid input/);
  });
});
