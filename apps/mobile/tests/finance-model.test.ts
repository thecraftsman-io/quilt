import { sampleData } from './fixtures/finance';
import { describe, expect, it } from 'vitest';
import { money } from '@quilt/domain';
import {
  balance,
  parseAmount,
  spending,
  type Entry,
} from '../src/features/finance/model';

describe('finance preview calculations', () => {
  it('keeps currency transfers balanced without adding spending', () => {
    const data = sampleData();
    const bank = data.accounts[0]!;
    const cash = data.accounts[1]!;
    const entry: Entry = {
      ...data.entries[0]!,
      id: 'transfer',
      kind: 'transfer',
      amount: money('20', 'EUR'),
      received: money('20', 'EUR'),
      destinationId: cash.id,
      date: '2026-06-10',
      bookedDate: '2026-06-10',
    };
    expect(balance(bank, [entry], '2026-06-10').amount).toBe('2430');
    expect(balance(cash, [entry], '2026-06-10').amount).toBe('100');
    expect(spending([entry], 'EUR', '2026-06').amount).toBe('0');
  });
  it('excludes opening-day, future, pending, and voided activity from booked balances', () => {
    const data = sampleData();
    const account = { ...data.accounts[0]!, openingDate: '2026-06-01' };
    const base = {
      ...data.entries[0]!,
      date: '2026-06-02',
      bookedDate: '2026-06-02',
    };
    const entries: Entry[] = [
      { ...base, id: 'opening', bookedDate: '2026-06-01' },
      { ...base, id: 'future', bookedDate: '2026-07-01' },
      { ...base, id: 'pending', status: 'pending' },
      { ...base, id: 'voided', voided: true },
      { ...base, id: 'booked', amount: money('0.30', 'EUR') },
    ];
    expect(balance(account, entries, '2026-06-30').amount).toBe('2449.7');
  });
  it('uses category allocations and subtracts refunds without mixing currencies', () => {
    const base = {
      ...sampleData().entries[0]!,
      date: '2026-06-02',
      bookedDate: '2026-06-02',
    };
    const entries: Entry[] = [
      {
        ...base,
        amount: money('30', 'EUR'),
        allocations: [
          { category: 'Groceries', amount: money('20', 'EUR') },
          { category: 'Home', amount: money('10', 'EUR') },
        ],
      },
      { ...base, id: 'refund', kind: 'refund', amount: money('5', 'EUR') },
      { ...base, id: 'foreign', amount: money('100', 'USD') },
    ];
    expect(spending(entries, 'EUR', '2026-06', 'Groceries').amount).toBe('15');
    expect(spending(entries, 'EUR', '2026-06').amount).toBe('25');
  });
  it('validates positive amounts while accepting signed opening balances', () => {
    expect(() => parseAmount('0', 'EUR')).toThrow();
    expect(() => parseAmount('-20', 'EUR')).toThrow();
    expect(() => parseAmount('1.001', 'EUR')).toThrow();
    expect(parseAmount('-20', 'EUR', true).amount).toBe('-20');
  });
});
