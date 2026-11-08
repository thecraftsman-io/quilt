import { describe, it, expect } from 'vitest';
import {
  CreateOrganizationSchema,
  InviteMemberSchema,
  SignUpWithEmailSchema,
  PaginationQuerySchema,
  AuthSessionSchema,
  ApiErrorResponseSchema,
} from '../src';

describe('Contracts Schemas', () => {
  it('CreateOrganizationSchema validates correct organization payloads', () => {
    const result = CreateOrganizationSchema.safeParse({
      name: 'Acme Household',
      slug: 'acme-household',
      logo: 'https://example.com/logo.png',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Acme Household');
      expect(result.data.slug).toBe('acme-household');
    }
  });

  it('CreateOrganizationSchema rejects empty names and invalid slugs', () => {
    const emptyNameResult = CreateOrganizationSchema.safeParse({
      name: '   ',
    });
    expect(emptyNameResult.success).toBe(false);

    const invalidSlugResult = CreateOrganizationSchema.safeParse({
      name: 'Valid Name',
      slug: 'INVALID SLUG WITH SPACES',
    });
    expect(invalidSlugResult.success).toBe(false);
  });

  it('InviteMemberSchema validates email and role', () => {
    const valid = InviteMemberSchema.safeParse({
      email: 'member@example.com',
      role: 'editor',
    });
    expect(valid.success).toBe(true);

    const invalidEmail = InviteMemberSchema.safeParse({
      email: 'not-an-email',
    });
    expect(invalidEmail.success).toBe(false);

    const invalidRole = InviteMemberSchema.safeParse({
      email: 'test@example.com',
      role: 'superadmin',
    });
    expect(invalidRole.success).toBe(false);
  });

  it('SignUpWithEmailSchema enforces strong password policy and valid email', () => {
    const valid = SignUpWithEmailSchema.safeParse({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'SecureP@ssword123',
    });
    expect(valid.success).toBe(true);

    const shortPassword = SignUpWithEmailSchema.safeParse({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'Sh0rt!1',
    });
    expect(shortPassword.success).toBe(false);

    const noUppercase = SignUpWithEmailSchema.safeParse({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'securep@ssword123',
    });
    expect(noUppercase.success).toBe(false);

    const noNumber = SignUpWithEmailSchema.safeParse({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'SecureP@ssword!',
    });
    expect(noNumber.success).toBe(false);

    const noSpecialChar = SignUpWithEmailSchema.safeParse({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'SecurePassword123',
    });
    expect(noSpecialChar.success).toBe(false);
  });

  it('PaginationQuerySchema coerces strings and provides defaults', () => {
    const parsedDefault = PaginationQuerySchema.parse({});
    expect(parsedDefault.page).toBe(1);
    expect(parsedDefault.limit).toBe(20);

    const parsedCoerced = PaginationQuerySchema.parse({
      page: '3',
      limit: '50',
    });
    expect(parsedCoerced.page).toBe(3);
    expect(parsedCoerced.limit).toBe(50);
  });

  it('auth session responses validate identity and strip transport tokens', () => {
    const raw = {
      session: {
        id: 'session-123',
        token: 'transport-bearer-token-should-be-omitted-by-schema',
        userId: 'user-456',
        expiresAt: '2026-11-12T00:00:00.000Z',
        createdAt: '2026-11-05T00:00:00.000Z',
        updatedAt: '2026-11-05T00:00:00.000Z',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        activeOrganizationId: 'org-789',
      },
      user: {
        id: 'user-456',
        name: 'Alex Rivera',
        email: 'alex@example.com',
        emailVerified: true,
        image: null,
        createdAt: '2026-11-05T00:00:00.000Z',
        updatedAt: '2026-11-05T00:00:00.000Z',
      },
    };
    const parsed = AuthSessionSchema.parse(raw);
    expect(parsed.session.id).toBe('session-123');
    expect(parsed.session.userId).toBe('user-456');
    expect(parsed.session.activeOrganizationId).toBe('org-789');
    expect(parsed.session.expiresAt instanceof Date).toBe(true);
    expect((parsed.session as { token?: unknown }).token).toBeUndefined();
    expect(parsed.user.name).toBe('Alex Rivera');
    expect(parsed.user.email).toBe('alex@example.com');
  });

  it('ApiErrorResponseSchema parses standardized error response payloads', () => {
    const valid = ApiErrorResponseSchema.safeParse({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      errors: [{ path: ['email'], message: 'Invalid email' }],
      timestamp: '2026-11-06T00:00:00.000Z',
      path: '/api/auth/sign-in',
      requestId: 'req-12345',
    });
    expect(valid.success).toBe(true);
  });
});
