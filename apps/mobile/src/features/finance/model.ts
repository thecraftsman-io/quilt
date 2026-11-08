import {
  addMoney,
  compareMoney,
  localDate,
  money,
  subtractMoney,
  type Money,
} from '@quilt/domain';

// Display helpers and legacy calculation fixtures. Live screens use API records and reports.
export interface Account {
  id: string;
  name: string;
  kind: 'bank' | 'cash' | 'credit-card';
  currency: string;
  openingBalance: Money;
  openingDate: string;
  archived: boolean;
}
export interface Entry {
  id: string;
  kind: 'expense' | 'income' | 'refund' | 'transfer' | 'adjustment';
  accountId: string;
  destinationId?: string;
  received?: Money;
  amount: Money;
  date: string;
  bookedDate: string;
  status: 'pending' | 'booked';
  merchant: string;
  category: string;
  note: string;
  tags: string;
  voided: boolean;
  receipt?: string;
  refundOf?: string;
  allocations?: { category: string; amount: Money }[];
}
export interface Plan {
  id: string;
  name: string;
  amount: Money;
  period: string;
  category: string;
}
export interface Goal extends Plan {
  saved: Money;
}
export interface Recurring extends Plan {
  direction: 'income' | 'expense';
  frequency: string;
  accountId: string;
  state: 'upcoming' | 'paid' | 'skipped';
  transactionId?: string;
}
export interface FinanceData {
  accounts: Account[];
  entries: Entry[];
  budgets: Plan[];
  goals: Goal[];
  recurring: Recurring[];
  categories: string[];
  merchants: string[];
  tags: string[];
  household: string;
  reportingCurrency: string;
  members: { id: string; email: string; role: string; invited: boolean }[];
}

export function today(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
export function display(value: Money) {
  // Conversion to Number is only for display; calculations use domain arithmetic.
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: value.currency,
  }).format(Number(value.amount));
}
export function parseAmount(value: string, currency: string, signed = false) {
  if (!/^-?(0|[1-9]\d*)(\.\d{1,2})?$/.test(value.trim()))
    throw new Error('Enter an amount with up to two decimal places.');
  const result = money(value.trim(), currency);
  if (!signed && compareMoney(result, money('0', currency)) <= 0)
    throw new Error('Enter an amount greater than zero.');
  return result;
}
export function checkDate(value: string) {
  localDate(value);
  return value;
}
export function balance(account: Account, entries: Entry[], asOf = today()) {
  return entries.reduce((total, entry) => {
    if (
      entry.voided ||
      entry.status === 'pending' ||
      entry.bookedDate <= account.openingDate ||
      entry.bookedDate > asOf
    )
      return total;
    if (entry.kind === 'transfer') {
      if (entry.accountId === account.id)
        return subtractMoney(total, entry.amount);
      if (entry.destinationId === account.id && entry.received)
        return addMoney(total, entry.received);
    } else if (entry.accountId === account.id) {
      return entry.kind === 'expense'
        ? subtractMoney(total, entry.amount)
        : addMoney(total, entry.amount);
    }
    return total;
  }, account.openingBalance);
}
export function spending(
  entries: Entry[],
  currency: string,
  month: string,
  category = '',
) {
  return entries.reduce(
    (total, entry) => {
      if (
        entry.voided ||
        entry.status !== 'booked' ||
        entry.amount.currency !== currency ||
        !entry.date.startsWith(month) ||
        !['expense', 'refund'].includes(entry.kind)
      )
        return total;
      const amount = category
        ? (
            entry.allocations ?? [
              { category: entry.category, amount: entry.amount },
            ]
          )
            .filter((a) => a.category === category)
            .reduce((sum, a) => addMoney(sum, a.amount), money('0', currency))
        : entry.amount;
      return entry.kind === 'refund'
        ? subtractMoney(total, amount)
        : addMoney(total, amount);
    },
    money('0', currency),
  );
}
