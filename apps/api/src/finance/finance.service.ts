import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  FinanceCreateCommandSchema,
  FinanceUpdateCommandSchema,
  FinanceVoidCommandSchema,
  FinanceDataSchemas,
  FinanceRecordSchemas,
  type FinanceRecord,
  type FinanceResource,
  type FinanceRecordMap,
  type FinanceSummary,
  type FinanceListQuery,
} from '@quilt/contracts';
import {
  accountBalance,
  addMoney,
  compareMoney,
  entityId,
  money,
  subtractMoney,
  spendingByCurrency,
  validateAccount,
  validateBudget,
  validateGoal,
  validateTransaction,
  type Transaction,
  type WorkspacePermission,
  type FinancialAccount,
} from '@quilt/domain';
import type { z } from 'zod';
import { FinanceRepository, type FinanceSession } from './finance.repository';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      errors: result.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
  return result.data;
}
function rule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new BadRequestException(message);
}
function domainRules(work: () => void) {
  try {
    work();
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? error.message : 'Invalid financial record.',
    );
  }
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${stable(v)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
async function required<K extends FinanceResource>(
  session: FinanceSession,
  resource: K,
  id: string,
): Promise<FinanceRecordMap[K]> {
  const value = await session.get(resource, id);
  if (!value) throw new NotFoundException('Record not found.');
  return value;
}
function touches(transaction: Transaction, accountId: string) {
  return transaction.kind === 'transfer'
    ? transaction.debit.accountId === accountId ||
        transaction.credit.accountId === accountId
    : transaction.accountId === accountId;
}

@Injectable()
export class FinanceService {
  constructor(private readonly repository: FinanceRepository) {}

  list(
    workspaceId: string,
    actorId: string,
    resource: FinanceResource,
    limit: number,
    offset: number,
    filters?: FinanceListQuery,
  ) {
    return this.repository.run(workspaceId, actorId, 'read', (session) =>
      session.page(
        resource,
        limit,
        offset,
        resource === 'transactions' ? filters : undefined,
      ),
    );
  }
  access(workspaceId: string, actorId: string) {
    return this.repository.run(workspaceId, actorId, 'read', (session) =>
      Promise.resolve(session.workspace),
    );
  }
  get(
    workspaceId: string,
    actorId: string,
    resource: FinanceResource,
    id: string,
  ) {
    return this.repository.run(workspaceId, actorId, 'read', (session) =>
      required(session, resource, id),
    );
  }
  create(
    workspaceId: string,
    actorId: string,
    resource: FinanceResource,
    input: unknown,
  ) {
    const command = parse(FinanceCreateCommandSchema, input);
    return this.write(
      workspaceId,
      actorId,
      resource,
      command.operationId,
      { action: 'create', resource, data: command.data },
      async (session) => {
        if (resource === 'settings' && (await session.list('settings')).length)
          throw new ConflictException('Workspace preferences already exist.');
        const now = new Date().toISOString();
        const value = await this.build(
          session,
          workspaceId,
          resource,
          command.data,
          {
            id: resource === 'settings' ? workspaceId : randomUUID(),
            workspaceId,
            version: 1,
            createdAt: now,
            updatedAt: now,
            createdBy: actorId,
            updatedBy: actorId,
          },
        );
        await session.save(resource, value, null, command.operationId);
        return value;
      },
    );
  }
  update(
    workspaceId: string,
    actorId: string,
    resource: FinanceResource,
    id: string,
    input: unknown,
  ) {
    const command = parse(FinanceUpdateCommandSchema, input);
    if (resource === 'contributions')
      throw new BadRequestException(
        'Contributions are immutable. Record a withdrawal or contribution to correct progress.',
      );
    return this.write(
      workspaceId,
      actorId,
      resource,
      command.operationId,
      { action: 'update', resource, id, ...command },
      async (session) => {
        const previous = await required(session, resource, id);
        this.checkVersion(previous, command.expectedVersion);
        const value = await this.build(
          session,
          workspaceId,
          resource,
          command.data,
          {
            id: previous.id,
            workspaceId,
            version: previous.version + 1,
            createdAt: previous.createdAt,
            createdBy: previous.createdBy,
            updatedAt: new Date().toISOString(),
            updatedBy: actorId,
          },
          previous,
        );
        await session.save(resource, value, previous, command.operationId);
        return value;
      },
    );
  }
  voidTransaction(
    workspaceId: string,
    actorId: string,
    id: string,
    input: unknown,
  ) {
    const command = parse(FinanceVoidCommandSchema, input);
    return this.write(
      workspaceId,
      actorId,
      'transactions',
      command.operationId,
      { action: 'void', id, ...command },
      async (session) => {
        const previous = await required(session, 'transactions', id);
        this.checkVersion(previous, command.expectedVersion);
        if (previous.voidedAt)
          throw new ConflictException('Transaction is already voided.');
        await this.requireUnlinked(session, id);
        const value = {
          ...previous,
          version: previous.version + 1,
          updatedAt: new Date().toISOString(),
          updatedBy: entityId<'user'>(actorId),
          voidedAt: new Date().toISOString(),
        };
        await session.save(
          'transactions',
          value,
          previous,
          command.operationId,
          command.reason,
        );
        return value;
      },
    );
  }
  restoreTransaction(
    workspaceId: string,
    actorId: string,
    id: string,
    input: unknown,
  ) {
    const command = parse(FinanceVoidCommandSchema, input);
    return this.write(
      workspaceId,
      actorId,
      'transactions',
      command.operationId,
      { action: 'restore', id, ...command },
      async (session) => {
        const previous = await required(session, 'transactions', id);
        this.checkVersion(previous, command.expectedVersion);
        if (!previous.voidedAt)
          throw new ConflictException('Transaction is already active.');
        const value = {
          ...previous,
          version: previous.version + 1,
          updatedAt: new Date().toISOString(),
          updatedBy: entityId<'user'>(actorId),
          voidedAt: null,
        };
        await this.validateLedger(session, value);
        await session.save(
          'transactions',
          value,
          previous,
          command.operationId,
          command.reason,
        );
        return value;
      },
    );
  }
  private checkVersion(value: FinanceRecord, expected: number) {
    if (value.version !== expected)
      throw new ConflictException({
        message: 'Record changed. Reload before editing.',
        currentVersion: value.version,
      });
  }
  private write(
    workspaceId: string,
    actorId: string,
    resource: FinanceResource,
    operationId: string,
    request: unknown,
    work: (session: FinanceSession) => Promise<FinanceRecord>,
  ) {
    const permission: WorkspacePermission =
      resource === 'settings' ? 'manage-members' : 'edit-finances';
    return this.repository.run(
      workspaceId,
      actorId,
      permission,
      async (session) => {
        const fingerprint = createHash('sha256')
          .update(stable(request))
          .digest('hex');
        const previous = await session.operation(operationId);
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            throw new ConflictException(
              'Operation ID was used for another request.',
            );
          return FinanceRecordSchemas[resource].parse(previous.result);
        }
        const result = await work(session);
        await session.remember(operationId, fingerprint, result);
        return result;
      },
    );
  }
  private async requireUnlinked(session: FinanceSession, id: string) {
    const transactions = await session.list('transactions');
    if (
      transactions.some(
        (t) => t.kind === 'refund' && t.refundOf === id && !t.voidedAt,
      ) ||
      (await session.list('contributions')).some((c) => c.transactionId === id)
    )
      throw new ConflictException(
        'This transaction has linked refunds or goal contributions. Resolve those links before changing it.',
      );
  }
  private async currentDate(session: FinanceSession) {
    const timeZone = (await session.list('settings'))[0]?.timeZone ?? 'UTC';
    const parts = new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const part = (kind: string) => parts.find((p) => p.type === kind)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  private async build(
    session: FinanceSession,
    workspaceId: string,
    resource: FinanceResource,
    input: unknown,
    metadata: Record<string, unknown>,
    previous?: FinanceRecord,
  ): Promise<FinanceRecord> {
    // Only server-generated metadata is merged. Client metadata is rejected by
    // strict contracts, including identity, version, provenance, and ownership.
    switch (resource) {
      case 'accounts': {
        const { archived, ...data } = parse(FinanceDataSchemas.accounts, input);
        const value = FinanceRecordSchemas.accounts.parse({
          ...data,
          ...metadata,
          archivedAt: archived ? new Date().toISOString() : null,
        });
        domainRules(() => validateAccount(value));
        rule(
          value.openingBalanceDate <= (await this.currentDate(session)),
          'Opening balance date cannot be in the future.',
        );
        if (previous) {
          const old = FinanceRecordSchemas.accounts.parse(previous);
          const history = await session.list('transactions');
          if (
            history.some((t) => touches(t, value.id)) &&
            (old.currency !== value.currency ||
              old.openingBalanceDate !== value.openingBalanceDate ||
              compareMoney(old.openingBalance, value.openingBalance) !== 0)
          )
            throw new ConflictException(
              'Opening balance and currency are locked once an account has activity. Use an adjustment.',
            );
        }
        return value;
      }
      case 'categories': {
        const { archived, ...data } = parse(
          FinanceDataSchemas.categories,
          input,
        );
        const value = FinanceRecordSchemas.categories.parse({
          ...data,
          ...metadata,
          archivedAt: archived ? new Date().toISOString() : null,
        });
        if (
          previous &&
          FinanceRecordSchemas.categories.parse(previous).kind !== value.kind
        )
          throw new ConflictException('Category type cannot be changed.');
        return value;
      }
      case 'merchants': {
        const { archived, ...data } = parse(
          FinanceDataSchemas.merchants,
          input,
        );
        return FinanceRecordSchemas.merchants.parse({
          ...data,
          ...metadata,
          archivedAt: archived ? new Date().toISOString() : null,
        });
      }
      case 'tags': {
        const { archived, ...data } = parse(FinanceDataSchemas.tags, input);
        return FinanceRecordSchemas.tags.parse({
          ...data,
          ...metadata,
          archivedAt: archived ? new Date().toISOString() : null,
        });
      }
      case 'transactions': {
        const data = parse(FinanceDataSchemas.transactions, input);
        if (previous) {
          const old = FinanceRecordSchemas.transactions.parse(previous);
          rule(old.voidedAt === null, 'Voided transactions cannot be edited.');
          rule(old.kind === data.kind, 'Transaction type cannot be changed.');
          await this.requireUnlinked(session, old.id);
        }
        const value = FinanceRecordSchemas.transactions.parse({
          ...data,
          ...metadata,
          creationOrigin: previous
            ? FinanceRecordSchemas.transactions.parse(previous).creationOrigin
            : data.kind === 'adjustment'
              ? 'adjustment'
              : 'manual',
          voidedAt: null,
          ...(data.kind === 'transfer' ? { conversionQuote: null } : {}),
        });
        await this.validateLedger(session, value);
        return value;
      }
      case 'budgets': {
        const { archived, ...data } = parse(FinanceDataSchemas.budgets, input);
        const value = FinanceRecordSchemas.budgets.parse({
          ...data,
          ...metadata,
          archivedAt: archived ? new Date().toISOString() : null,
        });
        const categories = await session.list('categories');
        for (const line of value.lines)
          if (line.categoryId)
            rule(
              categories.some((c) => c.id === line.categoryId && !c.archivedAt),
              'Select an active category in this workspace.',
            );
        domainRules(() => validateBudget(value, categories));
        rule(
          !(await session.list('budgets')).some(
            (b) =>
              b.id !== value.id &&
              !b.archivedAt &&
              !value.archivedAt &&
              b.month === value.month &&
              b.limit.currency === value.limit.currency,
          ),
          'A budget already exists for this month and currency.',
        );
        return value;
      }
      case 'goals': {
        const { archived, ...data } = parse(FinanceDataSchemas.goals, input);
        const value = FinanceRecordSchemas.goals.parse({
          ...data,
          ...metadata,
          archivedAt: archived ? new Date().toISOString() : null,
        });
        domainRules(() => validateGoal(value));
        if (previous)
          rule(
            FinanceRecordSchemas.goals.parse(previous).target.currency ===
              value.target.currency,
            'Goal currency cannot be changed.',
          );
        if (
          previous &&
          (await session.list('contributions')).some(
            (c) => c.goalId === value.id,
          )
        )
          rule(
            FinanceRecordSchemas.goals.parse(previous).startsOn ===
              value.startsOn,
            'Goal start date is locked once progress is recorded.',
          );
        return value;
      }
      case 'contributions': {
        const data = parse(FinanceDataSchemas.contributions, input);
        const value = FinanceRecordSchemas.contributions.parse({
          ...data,
          ...metadata,
        });
        const goal = await required(session, 'goals', value.goalId);
        rule(
          !goal.archivedAt && goal.target.currency === value.amount.currency,
          'Select an active goal in the contribution currency.',
        );
        rule(
          value.occurredOn <= (await this.currentDate(session)) &&
            value.occurredOn >= goal.startsOn,
          'Contribution date must fall between the goal start and today.',
        );
        const contributions = (await session.list('contributions')).filter(
          (c) => c.goalId === goal.id,
        );
        const progress = contributions.reduce(
          (sum, c) =>
            c.kind === 'contribution'
              ? addMoney(sum, c.amount)
              : subtractMoney(sum, c.amount),
          money('0', value.amount.currency),
        );
        if (value.kind === 'withdrawal')
          rule(
            compareMoney(progress, value.amount) >= 0,
            'Withdrawal exceeds goal progress.',
          );
        if (value.transactionId) {
          const transaction = await required(
            session,
            'transactions',
            value.transactionId,
          );
          rule(
            !transaction.voidedAt &&
              transaction.status === 'booked' &&
              transaction.kind === 'transfer',
            'Goal funding can link to a booked transfer.',
          );
          const funding =
            value.kind === 'contribution'
              ? transaction.credit.amount
              : transaction.debit.amount;
          rule(
            funding.currency === value.amount.currency,
            'Funding must use the goal currency.',
          );
          const linked = (await session.list('contributions'))
            .filter(
              (c) =>
                c.transactionId === transaction.id && c.kind === value.kind,
            )
            .reduce((sum, c) => addMoney(sum, c.amount), value.amount);
          rule(
            compareMoney(linked, funding) <= 0,
            'Contributions exceed the linked transfer amount.',
          );
        }
        return value;
      }
      case 'settings':
        return FinanceRecordSchemas.settings.parse({
          ...parse(FinanceDataSchemas.settings, input),
          ...metadata,
        });
    }
  }
  private async validateLedger(
    session: FinanceSession,
    transaction: FinanceRecordMap['transactions'],
  ) {
    const accounts = await session.list('accounts');
    const categories = await session.list('categories');
    const merchants = await session.list('merchants');
    const tags = await session.list('tags');
    const transactions = await session.list('transactions');
    const referencedAccounts: FinancialAccount[] = accounts.filter((a) =>
      touches(transaction, a.id),
    );
    rule(
      referencedAccounts.length === (transaction.kind === 'transfer' ? 2 : 1) &&
        referencedAccounts.every((a) => !a.archivedAt),
      'Select active accounts in this workspace.',
    );
    for (const tagId of transaction.tagIds)
      rule(
        tags.some((t) => t.id === tagId && !t.archivedAt),
        'Select active tags in this workspace.',
      );
    if ('allocations' in transaction) {
      for (const allocation of transaction.allocations)
        if (allocation.categoryId)
          rule(
            categories.some(
              (c) => c.id === allocation.categoryId && !c.archivedAt,
            ),
            'Select active categories in this workspace.',
          );
      if (transaction.merchantId)
        rule(
          merchants.some(
            (m) => m.id === transaction.merchantId && !m.archivedAt,
          ),
          'Select an active merchant in this workspace.',
        );
    }
    const refundedExpense =
      transaction.kind === 'refund' && transaction.refundOf
        ? transactions.find(
            (t) => t.id === transaction.refundOf && t.kind === 'expense',
          )
        : undefined;
    domainRules(() =>
      validateTransaction(transaction, {
        accounts,
        categories,
        merchants,
        tags,
        ...(refundedExpense?.kind === 'expense' ? { refundedExpense } : {}),
      }),
    );
    const today = await this.currentDate(session);
    if (transaction.status === 'booked')
      rule(
        transaction.bookedOn !== null &&
          transaction.bookedOn <= today &&
          referencedAccounts.every(
            (a) => transaction.bookedOn! > a.openingBalanceDate,
          ),
        'Booking date must be after the opening balances and no later than today.',
      );
    rule(
      transaction.status === 'pending' || transaction.occurredOn <= today,
      'Future activity must remain pending.',
    );
    if (transaction.kind === 'refund' && transaction.refundOf) {
      rule(
        refundedExpense?.kind === 'expense' &&
          refundedExpense.status === 'booked',
        'A linked refund needs a booked expense.',
      );
      const total = transactions
        .filter(
          (t) =>
            t.id !== transaction.id &&
            t.kind === 'refund' &&
            t.refundOf === transaction.refundOf &&
            !t.voidedAt,
        )
        .reduce(
          (sum, t) => (t.kind === 'refund' ? addMoney(sum, t.amount) : sum),
          transaction.amount,
        );
      rule(
        compareMoney(total, refundedExpense.amount) <= 0,
        'Refunds exceed the original expense amount.',
      );
    }
  }

  goalProgress(
    workspaceId: string,
    actorId: string,
    id: string,
    asOf: FinanceRecordMap['accounts']['openingBalanceDate'],
  ) {
    return this.repository.run(
      workspaceId,
      actorId,
      'read',
      async (session) => {
        const goal = await required(session, 'goals', id);
        const contributions = (await session.list('contributions')).filter(
          (c) => c.goalId === goal.id && c.occurredOn <= asOf,
        );
        const progress = contributions.reduce(
          (sum, c) =>
            c.kind === 'contribution'
              ? addMoney(sum, c.amount)
              : subtractMoney(sum, c.amount),
          money('0', goal.target.currency),
        );
        return { goalId: goal.id, asOf, target: goal.target, progress };
      },
    );
  }
  budgetProgress(
    workspaceId: string,
    actorId: string,
    id: string,
    asOf: FinanceRecordMap['accounts']['openingBalanceDate'],
  ) {
    return this.repository.run(
      workspaceId,
      actorId,
      'read',
      async (session) => {
        const budget = await required(session, 'budgets', id);
        const transactions = (await session.list('transactions')).filter(
          (t) =>
            t.occurredOn.startsWith(budget.month) &&
            t.occurredOn <= asOf &&
            t.bookedOn !== null &&
            t.bookedOn <= asOf,
        );
        const spent =
          spendingByCurrency(
            entityId<'workspace'>(workspaceId),
            transactions,
          ).find((m) => m.currency === budget.limit.currency) ??
          money('0', budget.limit.currency);
        const lines = budget.lines.map((line) => {
          let used = money('0', line.limit.currency);
          for (const transaction of transactions)
            if (
              !transaction.voidedAt &&
              transaction.status === 'booked' &&
              (transaction.kind === 'expense' ||
                transaction.kind === 'refund') &&
              transaction.amount.currency === line.limit.currency
            ) {
              for (const allocation of transaction.allocations)
                if (allocation.categoryId === line.categoryId)
                  used =
                    transaction.kind === 'refund'
                      ? subtractMoney(used, allocation.amount)
                      : addMoney(used, allocation.amount);
            }
          return {
            categoryId: line.categoryId,
            limit: line.limit,
            spent: used,
            remaining: subtractMoney(line.limit, used),
          };
        });
        return {
          budgetId: budget.id,
          asOf,
          limit: budget.limit,
          spent,
          remaining: subtractMoney(budget.limit, spent),
          lines,
        };
      },
    );
  }

  summary(
    workspaceId: string,
    actorId: string,
    month: FinanceSummary['cashFlow']['month'],
    currency: FinanceSummary['cashFlow']['currency'],
    asOf: FinanceRecordMap['accounts']['openingBalanceDate'],
  ) {
    return this.repository.run(
      workspaceId,
      actorId,
      'read',
      async (session): Promise<FinanceSummary> => {
        const accounts = await session.list('accounts');
        const transactions = await session.list('transactions');
        let income = money('0', currency);
        let refunds = money('0', currency);
        let expenses = money('0', currency);
        const incomingCategories = new Map<string | null, typeof income>();
        const outgoingCategories = new Map<string | null, typeof income>();
        for (const transaction of transactions) {
          if (
            transaction.voidedAt ||
            transaction.status !== 'booked' ||
            !transaction.bookedOn?.startsWith(month) ||
            transaction.bookedOn > asOf ||
            !('amount' in transaction) ||
            transaction.amount.currency !== currency
          )
            continue;
          if (transaction.kind === 'income')
            income = addMoney(income, transaction.amount);
          else if (transaction.kind === 'refund')
            refunds = addMoney(refunds, transaction.amount);
          else expenses = addMoney(expenses, transaction.amount);
          if (transaction.kind !== 'refund')
            for (const allocation of transaction.allocations) {
              const target =
                transaction.kind === 'income'
                  ? incomingCategories
                  : outgoingCategories;
              target.set(
                allocation.categoryId,
                addMoney(
                  target.get(allocation.categoryId) ?? money('0', currency),
                  allocation.amount,
                ),
              );
            }
        }
        const incoming = addMoney(income, refunds);
        return {
          cashFlow: {
            month,
            currency,
            income,
            refunds,
            incoming,
            expenses,
            net: subtractMoney(incoming, expenses),
            incomeCategories: [...incomingCategories].map(
              ([categoryId, amount]) => ({
                categoryId:
                  categoryId === null ? null : entityId<'category'>(categoryId),
                amount,
              }),
            ),
            expenseCategories: [...outgoingCategories].map(
              ([categoryId, amount]) => ({
                categoryId:
                  categoryId === null ? null : entityId<'category'>(categoryId),
                amount,
              }),
            ),
          },
          balances: accounts
            .filter((a) => !a.archivedAt && a.openingBalanceDate <= asOf)
            .map((account) => ({
              accountId: account.id,
              balance: accountBalance(account, transactions, asOf),
            })),
        };
      },
    );
  }
}
