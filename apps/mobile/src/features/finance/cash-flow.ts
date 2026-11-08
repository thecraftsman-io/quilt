import {
  addMoney,
  compareMoney,
  money,
  subtractMoney,
  yearMonth,
  type Money,
} from '@quilt/domain';
import type { Entry } from './model';

export interface FlowGroup {
  key: string;
  label: string;
  amount: Money;
}

/** Actual cash movement by booking month. Refunds are inflows, not earnings. */
export function cashFlow(
  entries: readonly Entry[],
  month: string,
  currency: string,
) {
  yearMonth(month);
  let income = money('0', currency);
  let refunds = money('0', currency);
  let expenses = money('0', currency);
  const incomeGroups = new Map<string, Money>();
  const expenseGroups = new Map<string, Money>();
  for (const entry of entries) {
    if (
      entry.voided ||
      entry.status !== 'booked' ||
      entry.amount.currency !== currency ||
      !entry.bookedDate.startsWith(month)
    )
      continue;
    if (entry.kind === 'refund') {
      refunds = addMoney(refunds, entry.amount);
      continue;
    }
    if (entry.kind !== 'income' && entry.kind !== 'expense') continue;
    if (entry.kind === 'income') income = addMoney(income, entry.amount);
    else expenses = addMoney(expenses, entry.amount);
    const groups = entry.kind === 'income' ? incomeGroups : expenseGroups;
    for (const allocation of entry.allocations ?? [
      { category: entry.category, amount: entry.amount },
    ]) {
      const label = allocation.category || 'Uncategorized';
      groups.set(
        label,
        addMoney(groups.get(label) ?? money('0', currency), allocation.amount),
      );
    }
  }
  const incoming = addMoney(income, refunds);
  const net = subtractMoney(incoming, expenses);
  const total = compareMoney(incoming, expenses) >= 0 ? incoming : expenses;
  const sources = [...incomeGroups].map(([label, amount]) => ({
    key: `income:${label}`,
    label,
    amount,
  }));
  const destinations = [...expenseGroups].map(([label, amount]) => ({
    key: `expense:${label}`,
    label,
    amount,
  }));
  if (refunds.amount !== '0')
    sources.push({ key: 'refunds', label: 'Refunds', amount: refunds });
  if (compareMoney(net, money('0', currency)) < 0)
    sources.push({
      key: 'balance',
      label: 'From balance',
      amount: subtractMoney(expenses, incoming),
    });
  if (compareMoney(net, money('0', currency)) > 0)
    destinations.push({ key: 'remaining', label: 'Left over', amount: net });
  return {
    income,
    refunds,
    incoming,
    expenses,
    net,
    total,
    sources: compactGroups(sources),
    destinations: compactGroups(destinations),
  };
}

function compactGroups(groups: FlowGroup[]): FlowGroup[] {
  const sorted = groups.toSorted((a, b) => compareMoney(b.amount, a.amount));
  if (sorted.length <= 6) return sorted;
  const rest = sorted.slice(5);
  return [
    ...sorted.slice(0, 5),
    {
      key: 'other',
      label: 'Other',
      amount: rest
        .slice(1)
        .reduce((sum, g) => addMoney(sum, g.amount), rest[0]!.amount),
    },
  ];
}

export function shiftMonth(month: string, offset: number) {
  yearMonth(month);
  const [year = 0, number = 1] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Graph geometry consumes complete server totals, never a paginated history. */
export function cashFlowFromReport(
  report: import('@quilt/contracts').CashFlowReport,
  categoryName: (id: string | null) => string,
) {
  const sources: FlowGroup[] = report.incomeCategories.map((g) => ({
    key: `income:${g.categoryId ?? 'uncategorized'}`,
    label: categoryName(g.categoryId),
    amount: g.amount,
  }));
  const destinations: FlowGroup[] = report.expenseCategories.map((g) => ({
    key: `expense:${g.categoryId ?? 'uncategorized'}`,
    label: categoryName(g.categoryId),
    amount: g.amount,
  }));
  if (report.refunds.amount !== '0')
    sources.push({ key: 'refunds', label: 'Refunds', amount: report.refunds });
  if (compareMoney(report.net, money('0', report.currency)) < 0)
    sources.push({
      key: 'balance',
      label: 'From balance',
      amount: subtractMoney(report.expenses, report.incoming),
    });
  if (compareMoney(report.net, money('0', report.currency)) > 0)
    destinations.push({
      key: 'remaining',
      label: 'Left over',
      amount: report.net,
    });
  return {
    income: report.income,
    refunds: report.refunds,
    incoming: report.incoming,
    expenses: report.expenses,
    net: report.net,
    total:
      compareMoney(report.incoming, report.expenses) >= 0
        ? report.incoming
        : report.expenses,
    sources: compactGroups(sources),
    destinations: compactGroups(destinations),
  };
}
