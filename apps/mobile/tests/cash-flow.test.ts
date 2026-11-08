import { sampleData } from './fixtures/finance';
import { describe, expect, it } from 'vitest';
import { addMoney, money } from '@quilt/domain';
import { cashFlow, shiftMonth } from '../src/features/finance/cash-flow';
import { type Entry } from '../src/features/finance/model';

const base: Entry = {
  ...sampleData().entries[0]!,
  date: '2026-05-31',
  bookedDate: '2026-06-01',
  amount: money('0.30', 'EUR'),
};
describe('cash flow', () => {
  it('uses booking dates, exact amounts and category allocations', () => {
    const flow = cashFlow(
      [
        {
          ...base,
          id: 'salary',
          kind: 'income',
          category: 'Salary',
          amount: money('1', 'EUR'),
        },
        {
          ...base,
          allocations: [
            { category: 'Food', amount: money('0.10', 'EUR') },
            { category: 'Home', amount: money('0.20', 'EUR') },
          ],
        },
        { ...base, id: 'refund', kind: 'refund', amount: money('0.10', 'EUR') },
      ],
      '2026-06',
      'EUR',
    );
    expect(flow.income.amount).toBe('1');
    expect(flow.refunds.amount).toBe('0.1');
    expect(flow.incoming.amount).toBe('1.1');
    expect(flow.expenses.amount).toBe('0.3');
    expect(flow.net.amount).toBe('0.8');
    expect(
      flow.destinations.find((g) => g.label === 'Food')?.amount.amount,
    ).toBe('0.1');
    expect(
      flow.destinations.find((g) => g.key === 'remaining')?.amount.amount,
    ).toBe('0.8');
  });
  it('shows a balance draw when expenses exceed inflows and conserves both sides', () => {
    const flow = cashFlow([base], '2026-06', 'EUR');
    expect(flow.sources[0]?.key).toBe('balance');
    expect(flow.net.amount).toBe('-0.3');
    for (const groups of [flow.sources, flow.destinations])
      expect(
        groups.reduce((sum, g) => addMoney(sum, g.amount), money('0', 'EUR')),
      ).toEqual(flow.total);
  });
  it('excludes pending, voided, other-currency, out-of-period, transfers and adjustments', () => {
    const entries: Entry[] = [
      { ...base, status: 'pending' },
      { ...base, voided: true },
      { ...base, amount: money('1', 'USD') },
      { ...base, bookedDate: '2026-05-31' },
      { ...base, kind: 'transfer' },
      { ...base, kind: 'adjustment' },
    ];
    const flow = cashFlow(entries, '2026-06', 'EUR');
    expect(flow.total.amount).toBe('0');
    expect(flow.sources).toEqual([]);
    expect(flow.destinations).toEqual([]);
  });
  it('groups long category lists while preserving the total', () => {
    const flow = cashFlow(
      Array.from({ length: 10 }, (_, i) => ({
        ...base,
        id: String(i),
        category: `Category ${i}`,
      })),
      '2026-06',
      'EUR',
    );
    expect(flow.destinations).toHaveLength(6);
    expect(
      flow.destinations.find((g) => g.key === 'other')?.amount.amount,
    ).toBe('1.5');
    expect(flow.total.amount).toBe('3');
  });
  it('moves months across calendar years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});
