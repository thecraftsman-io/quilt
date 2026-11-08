import { money } from '@quilt/domain';
import { today, type FinanceData } from '../../src/features/finance/model';

export function sampleData(): FinanceData {
  const date = today();
  const month = date.slice(0, 7);
  return {
    household: 'Our household',
    reportingCurrency: 'EUR',
    accounts: [
      {
        id: 'bank',
        name: 'Everyday account',
        kind: 'bank',
        currency: 'EUR',
        openingBalance: money('2450', 'EUR'),
        openingDate: '2020-01-01',
        archived: false,
      },
      {
        id: 'cash',
        name: 'Cash wallet',
        kind: 'cash',
        currency: 'EUR',
        openingBalance: money('80', 'EUR'),
        openingDate: '2020-01-01',
        archived: false,
      },
    ],
    entries: [
      {
        id: 'groceries',
        kind: 'expense',
        accountId: 'bank',
        amount: money('64.50', 'EUR'),
        date,
        bookedDate: date,
        status: 'booked',
        merchant: 'Local market',
        category: 'Groceries',
        note: 'The weekly shop',
        tags: '',
        voided: false,
      },
      {
        id: 'coffee',
        kind: 'expense',
        accountId: 'cash',
        amount: money('4.20', 'EUR'),
        date,
        bookedDate: date,
        status: 'booked',
        merchant: 'Corner café',
        category: 'Eating out',
        note: '',
        tags: '',
        voided: false,
      },
    ],
    budgets: [
      {
        id: 'food',
        name: 'Groceries',
        amount: money('400', 'EUR'),
        period: month,
        category: 'Groceries',
      },
    ],
    goals: [
      {
        id: 'holiday',
        name: 'A little getaway',
        amount: money('1500', 'EUR'),
        saved: money('350', 'EUR'),
        period: `${date.slice(0, 4)}-12-31`,
        category: '',
      },
    ],
    recurring: [
      {
        id: 'rent',
        name: 'Rent',
        amount: money('950', 'EUR'),
        period: date,
        category: 'Home',
        direction: 'expense',
        frequency: 'Monthly',
        accountId: 'bank',
        state: 'upcoming',
      },
    ],
    categories: ['Groceries', 'Home', 'Eating out', 'Transport', 'Salary'],
    merchants: ['Local market', 'Corner café'],
    tags: ['Shared', 'Holiday'],
    members: [{ id: 'you', email: 'You', role: 'Owner', invited: false }],
  };
}
