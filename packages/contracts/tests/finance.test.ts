import { describe, expect, it } from 'vitest';
import {
  FinanceDataSchemas,
  FinanceCreateCommandSchema,
  MoneySchema,
  TransactionDataSchema,
  InviteMemberSchema,
  FinanceDateSchema,
  FinanceMonthSchema,
} from '../src';

describe('finance contracts', () => {
  it('rejects unsupported precision, currencies and client-owned metadata', () => {
    expect(
      MoneySchema.safeParse({ amount: '1.001', currency: 'EUR' }).success,
    ).toBe(false);
    expect(
      MoneySchema.safeParse({ amount: '10', currency: 'XYZ' }).success,
    ).toBe(false);
    expect(
      MoneySchema.safeParse({ amount: 0.1, currency: 'EUR' }).success,
    ).toBe(false);
    const data = {
      name: 'Cash',
      kind: 'cash',
      currency: 'EUR',
      openingBalance: { amount: '0', currency: 'EUR' },
      openingBalanceDate: '2026-01-01',
      archived: false,
    };
    expect(FinanceDataSchemas.accounts.safeParse(data).success).toBe(true);
    expect(
      FinanceDataSchemas.accounts.safeParse({ ...data, workspaceId: 'foreign' })
        .success,
    ).toBe(false);
    expect(
      FinanceCreateCommandSchema.safeParse({ operationId: 'bad', data })
        .success,
    ).toBe(false);
  });
  it('requires coherent booking dates, unique tags and positive amounts', () => {
    const data = {
      kind: 'expense',
      accountId: 'cash',
      occurredOn: '2026-01-01',
      bookedOn: null,
      status: 'pending',
      amount: { amount: '1', currency: 'EUR' },
      allocations: [
        {
          key: 'whole',
          categoryId: null,
          amount: { amount: '1', currency: 'EUR' },
        },
      ],
      merchantId: null,
      note: null,
      tagIds: [],
    };
    expect(TransactionDataSchema.safeParse(data).success).toBe(true);
    expect(
      TransactionDataSchema.safeParse({ ...data, status: 'booked' }).success,
    ).toBe(false);
    expect(
      TransactionDataSchema.safeParse({ ...data, tagIds: ['one', 'one'] })
        .success,
    ).toBe(false);
    expect(
      TransactionDataSchema.safeParse({
        ...data,
        amount: { amount: '-1', currency: 'EUR' },
      }).success,
    ).toBe(false);
    expect(
      TransactionDataSchema.safeParse({ ...data, occurredOn: '2026-02-30' })
        .success,
    ).toBe(false);
  });
  it('uses household roles and rejects privileged legacy-role inputs', () => {
    for (const role of ['owner', 'editor', 'viewer'])
      expect(
        InviteMemberSchema.safeParse({ email: 'person@example.com', role })
          .success,
      ).toBe(true);
    expect(
      InviteMemberSchema.safeParse({
        email: 'person@example.com',
        role: 'admin',
      }).success,
    ).toBe(false);
  });
  it('rejects year zero without throwing from a domain transform', () => {
    expect(FinanceDateSchema.safeParse('0000-01-01').success).toBe(false);
    expect(FinanceMonthSchema.safeParse('0000-01').success).toBe(false);
  });
});
