import { z } from 'zod';
import {
  entityId,
  money,
  currencyCode,
  localDate,
  yearMonth,
  type EntityKind,
} from '@quilt/domain';

export const FinanceCurrencySchema = z
  .enum(['EUR', 'USD', 'GBP'])
  .transform(currencyCode);
const amount = z
  .string()
  .regex(
    /^-?(0|[1-9]\d{0,11})(\.\d{1,2})?$/,
    'Use a decimal string with at most two decimal places.',
  );
export const MoneySchema = z
  .strictObject({ amount, currency: FinanceCurrencySchema })
  .transform((v) => money(v.amount, v.currency));
const positiveMoney = MoneySchema.refine(
  (v) => !v.amount.startsWith('-') && v.amount !== '0',
  'Amount must be positive.',
);
const nonnegativeMoney = MoneySchema.refine(
  (v) => !v.amount.startsWith('-'),
  'Amount must not be negative.',
);
export const FinanceDateSchema = z.iso
  .date()
  .refine((value) => !value.startsWith('0000-'), 'Year must be at least 0001.')
  .transform(localDate);
export const FinanceMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine((value) => !value.startsWith('0000-'), 'Year must be at least 0001.')
  .transform(yearMonth);
export const FinanceIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const identifier = <K extends EntityKind>(kind: K) =>
  FinanceIdSchema.transform((value) => {
    void kind;
    return entityId<K>(value);
  });
const name = z.string().trim().min(1).max(100);
const metadata = {
  version: z.number().int().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdBy: identifier('user'),
  updatedBy: identifier('user'),
  workspaceId: identifier('workspace'),
};
const record = <K extends EntityKind>(kind: K) => ({
  ...metadata,
  id: identifier(kind),
});
const archived = { archivedAt: z.iso.datetime().nullable() };
const accountFields = {
  name,
  kind: z.enum(['cash', 'bank', 'credit-card']),
  currency: FinanceCurrencySchema,
  openingBalance: MoneySchema,
  openingBalanceDate: FinanceDateSchema,
};
const categoryFields = { name, kind: z.enum(['expense', 'income']) };
const merchantFields = { name, aliases: z.array(name).max(30) };
const tagFields = { name };
const allocation = z.strictObject({
  key: FinanceIdSchema,
  categoryId: identifier('category').nullable(),
  amount: positiveMoney,
});
const transactionFields = {
  occurredOn: FinanceDateSchema,
  status: z.enum(['pending', 'booked']),
  bookedOn: FinanceDateSchema.nullable(),
  note: z.string().trim().max(2000).nullable(),
  tagIds: z
    .array(identifier('tag'))
    .max(30)
    .refine((ids) => new Set(ids).size === ids.length, 'Tags must be unique.'),
};
const categorized = {
  ...transactionFields,
  accountId: identifier('account'),
  amount: positiveMoney,
  merchantId: identifier('merchant').nullable(),
  allocations: z.array(allocation).min(1).max(50),
};
const transactionVariants = [
  z.strictObject({ ...categorized, kind: z.literal('expense') }),
  z.strictObject({ ...categorized, kind: z.literal('income') }),
  z.strictObject({
    ...categorized,
    kind: z.literal('refund'),
    refundOf: identifier('transaction').nullable(),
  }),
  z.strictObject({
    ...transactionFields,
    kind: z.literal('transfer'),
    debit: z.strictObject({
      accountId: identifier('account'),
      amount: positiveMoney,
    }),
    credit: z.strictObject({
      accountId: identifier('account'),
      amount: positiveMoney,
    }),
  }),
  z.strictObject({
    ...transactionFields,
    kind: z.literal('adjustment'),
    accountId: identifier('account'),
    delta: MoneySchema.refine(
      (v) => v.amount !== '0',
      'Adjustment cannot be zero.',
    ),
    reason: z.string().trim().min(1).max(500),
  }),
] as const;
export const TransactionDataSchema = z
  .discriminatedUnion('kind', transactionVariants)
  .refine(
    (v) => (v.status === 'booked' ? v.bookedOn !== null : v.bookedOn === null),
    'Booked transactions need a booking date; pending transactions must not have one.',
  );
const transactionMetadata = {
  ...record('transaction'),
  creationOrigin: z.enum(['manual', 'import', 'receipt', 'adjustment']),
  voidedAt: z.iso.datetime().nullable(),
};
const budgetFields = {
  name,
  month: FinanceMonthSchema,
  limit: nonnegativeMoney,
  lines: z
    .array(
      z.strictObject({
        id: identifier('budget-line'),
        categoryId: identifier('category').nullable(),
        limit: nonnegativeMoney,
      }),
    )
    .max(100),
};
const goalFields = {
  name,
  startsOn: FinanceDateSchema,
  targetOn: FinanceDateSchema.nullable(),
  progressMode: z.literal('tracked'),
  target: positiveMoney,
};
const contributionFields = {
  goalId: identifier('goal'),
  kind: z.enum(['contribution', 'withdrawal']),
  amount: positiveMoney,
  occurredOn: FinanceDateSchema,
  transactionId: identifier('transaction').nullable(),
};
const settingsFields = {
  reportingCurrency: FinanceCurrencySchema,
  timeZone: z
    .string()
    .min(1)
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Use an IANA time zone.'),
};

export const FinanceDataSchemas = {
  accounts: z.strictObject({ ...accountFields, archived: z.boolean() }),
  categories: z.strictObject({ ...categoryFields, archived: z.boolean() }),
  merchants: z.strictObject({ ...merchantFields, archived: z.boolean() }),
  tags: z.strictObject({ ...tagFields, archived: z.boolean() }),
  transactions: TransactionDataSchema,
  budgets: z.strictObject({ ...budgetFields, archived: z.boolean() }),
  goals: z.strictObject({ ...goalFields, archived: z.boolean() }),
  contributions: z.strictObject(contributionFields),
  settings: z.strictObject(settingsFields),
};
export const FinanceRecordSchemas = {
  accounts: z.strictObject({
    ...record('account'),
    ...accountFields,
    ...archived,
  }),
  categories: z.strictObject({
    ...record('category'),
    ...categoryFields,
    ...archived,
  }),
  merchants: z.strictObject({
    ...record('merchant'),
    ...merchantFields,
    ...archived,
  }),
  tags: z.strictObject({ ...record('tag'), ...tagFields, ...archived }),
  transactions: z.discriminatedUnion('kind', [
    transactionVariants[0].extend(transactionMetadata),
    transactionVariants[1].extend(transactionMetadata),
    transactionVariants[2].extend(transactionMetadata),
    transactionVariants[3].extend({
      ...transactionMetadata,
      conversionQuote: z.null(),
    }),
    transactionVariants[4].extend(transactionMetadata),
  ]),
  budgets: z.strictObject({
    ...record('budget'),
    ...budgetFields,
    ...archived,
  }),
  goals: z.strictObject({ ...record('goal'), ...goalFields, ...archived }),
  contributions: z.strictObject({
    ...record('goal-contribution'),
    ...contributionFields,
  }),
  settings: z.strictObject({ ...record('workspace'), ...settingsFields }),
};
export const FinanceResourceSchema = z.enum([
  'accounts',
  'categories',
  'merchants',
  'tags',
  'transactions',
  'budgets',
  'goals',
  'contributions',
  'settings',
]);
export type FinanceResource = z.infer<typeof FinanceResourceSchema>;
export type FinanceRecordMap = {
  [K in FinanceResource]: z.output<(typeof FinanceRecordSchemas)[K]>;
};
export type FinanceDataMap = {
  [K in FinanceResource]: z.output<(typeof FinanceDataSchemas)[K]>;
};
export type FinanceRecord = FinanceRecordMap[FinanceResource];
export type FinanceCreateInput<K extends FinanceResource> = {
  operationId: string;
  data: z.input<(typeof FinanceDataSchemas)[K]>;
};
export type FinanceUpdateInput<
  K extends Exclude<FinanceResource, 'contributions'>,
> = FinanceCreateInput<K> & { expectedVersion: number };
export type FinancePage<K extends FinanceResource> = {
  items: FinanceRecordMap[K][];
  total: number;
  limit: number;
  offset: number;
};
export const FinanceCreateCommandSchema = z.strictObject({
  operationId: z.uuid(),
  data: z.unknown(),
});
export const FinanceUpdateCommandSchema = z.strictObject({
  operationId: z.uuid(),
  expectedVersion: z.number().int().min(1),
  data: z.unknown(),
});
export const FinanceVoidCommandSchema = z.strictObject({
  operationId: z.uuid(),
  expectedVersion: z.number().int().min(1),
  reason: z.string().trim().min(1).max(500),
});
export const FinanceListQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  accountId: identifier('account').optional(),
  kind: z
    .enum(['expense', 'income', 'refund', 'transfer', 'adjustment'])
    .optional(),
  status: z.enum(['pending', 'booked']).optional(),
  month: FinanceMonthSchema.optional(),
  search: z.string().trim().max(100).optional(),
  voided: z.enum(['all', 'active', 'voided']).optional(),
});
export type FinanceListQuery = z.output<typeof FinanceListQuerySchema>;
export const WorkspaceAccessSchema = z.strictObject({
  id: identifier('workspace'),
  name: z.string(),
  role: z.enum(['owner', 'editor', 'viewer']),
});
export type WorkspaceAccess = z.output<typeof WorkspaceAccessSchema>;
export const FinanceReportQuerySchema = z.strictObject({
  month: FinanceMonthSchema,
  currency: FinanceCurrencySchema,
  asOf: FinanceDateSchema,
});
export const FinanceAsOfQuerySchema = z.strictObject({
  asOf: FinanceDateSchema,
});
// Aggregated balances can exceed the per-entry input bound.
const reportMoney = z
  .strictObject({
    amount: z
      .string()
      .max(64)
      .regex(/^-?(0|[1-9]\d*)(\.\d{1,2})?$/),
    currency: FinanceCurrencySchema,
  })
  .transform((v) => money(v.amount, v.currency));
export const GoalProgressSchema = z.strictObject({
  goalId: identifier('goal'),
  asOf: FinanceDateSchema,
  target: MoneySchema,
  progress: reportMoney,
});
export const BudgetProgressSchema = z.strictObject({
  budgetId: identifier('budget'),
  asOf: FinanceDateSchema,
  limit: MoneySchema,
  spent: reportMoney,
  remaining: reportMoney,
  lines: z.array(
    z.strictObject({
      categoryId: identifier('category').nullable(),
      limit: MoneySchema,
      spent: reportMoney,
      remaining: reportMoney,
    }),
  ),
});
export const CashFlowReportSchema = z.strictObject({
  month: FinanceMonthSchema,
  currency: FinanceCurrencySchema,
  income: reportMoney,
  refunds: reportMoney,
  incoming: reportMoney,
  expenses: reportMoney,
  net: reportMoney,
  incomeCategories: z.array(
    z.strictObject({
      categoryId: identifier('category').nullable(),
      amount: reportMoney,
    }),
  ),
  expenseCategories: z.array(
    z.strictObject({
      categoryId: identifier('category').nullable(),
      amount: reportMoney,
    }),
  ),
});
export type CashFlowReport = z.output<typeof CashFlowReportSchema>;
export const FinanceSummarySchema = z.strictObject({
  cashFlow: CashFlowReportSchema,
  balances: z.array(
    z.strictObject({ accountId: identifier('account'), balance: reportMoney }),
  ),
});
export type FinanceSummary = z.output<typeof FinanceSummarySchema>;
export const FinanceMemberRoleSchema = z.enum(['owner', 'editor', 'viewer']);

export const FinanceEndpoints = {
  collection: '/api/workspaces/:workspaceId/:resource',
  item: '/api/workspaces/:workspaceId/:resource/:id',
  voidTransaction: '/api/workspaces/:workspaceId/transactions/:id/void',
  restoreTransaction: '/api/workspaces/:workspaceId/transactions/:id/restore',
  summary: '/api/workspaces/:workspaceId/summary',
} as const;
