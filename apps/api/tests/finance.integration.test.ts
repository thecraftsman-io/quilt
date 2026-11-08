import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { createDatabase } from '@quilt/db';
import { FinanceRecordSchemas } from '@quilt/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FinanceController as Controller } from '../src/finance/finance.controller';
import type { FinanceRepository as Repository } from '../src/finance/finance.repository';
import type { FinanceService as Service } from '../src/finance/finance.service';
import type { FinanceBoundaryGuard as Boundary } from '../src/finance/finance-boundary.guard';
import type { AuthGuard as Guard } from '../src/auth/guards/auth.guard';
import type { AuthService as Auth } from '../src/auth/auth.service';
import type { DatabaseService as Database } from '../src/database/database.service';

import type { OrganizationsController as Organizations } from '../src/organizations/organizations.controller';
import type { DefaultHouseholdService as Defaults } from '../src/organizations/default-household.service';

const connection = process.env.QUILT_FINANCE_TEST_DATABASE_URL;
const require = createRequire(import.meta.url);
const { FinanceController } =
  require('../dist/finance/finance.controller.js') as {
    FinanceController: typeof Controller;
  };
const { FinanceRepository } =
  require('../dist/finance/finance.repository.js') as {
    FinanceRepository: typeof Repository;
  };
const { FinanceService } = require('../dist/finance/finance.service.js') as {
  FinanceService: typeof Service;
};
const { FinanceBoundaryGuard } =
  require('../dist/finance/finance-boundary.guard.js') as {
    FinanceBoundaryGuard: typeof Boundary;
  };
const { AuthGuard } = require('../dist/auth/guards/auth.guard.js') as {
  AuthGuard: typeof Guard;
};
const { AuthService } = require('../dist/auth/auth.service.js') as {
  AuthService: typeof Auth;
};
const { OrganizationsController } =
  require('../dist/organizations/organizations.controller.js') as {
    OrganizationsController: typeof Organizations;
  };
const { DefaultHouseholdService } =
  require('../dist/organizations/default-household.service.js') as {
    DefaultHouseholdService: typeof Defaults;
  };
const { DatabaseService } = require('../dist/database/database.service.js') as {
  DatabaseService: typeof Database;
};

const amount = (value: string, currency = 'EUR') => ({
  amount: value,
  currency,
});
const accountData = (name = 'Everyday') => ({
  name,
  kind: 'bank',
  currency: 'EUR',
  openingBalance: amount('1000'),
  openingBalanceDate: '2020-01-01',
  archived: false,
});
const expenseData = (accountId: string, value = '10') => ({
  kind: 'expense',
  accountId,
  amount: amount(value),
  occurredOn: '2026-01-02',
  bookedOn: '2026-01-02',
  status: 'booked',
  allocations: [{ key: 'whole', categoryId: null, amount: amount(value) }],
  merchantId: null,
  note: null,
  tagIds: [],
});

describe.skipIf(!connection)('Finance HTTP + PostgreSQL integration', () => {
  let app: NestFastifyApplication;
  let database: ReturnType<typeof createDatabase>;
  let admin: ReturnType<typeof createDatabase>;
  const schemaName = `finance_test_${randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    if (!connection || new URL(connection).pathname !== '/quilt_test')
      throw new Error('Use the dedicated quilt_test database.');
    admin = createDatabase(connection);
    await admin.pool.query(`CREATE SCHEMA "${schemaName}"`);
    const url = new URL(connection);
    url.searchParams.set('options', `-c search_path=${schemaName},public`);
    database = createDatabase(url.toString());
    const migrations = resolve(__dirname, '../../../packages/db/drizzle');
    for (const file of (await readdir(migrations))
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      const sql = (
        await readFile(resolve(migrations, file), 'utf8')
      ).replaceAll('"public".', `"${schemaName}".`);
      await database.pool.query(sql);
    }
    class TestModule {}
    Module({
      controllers: [FinanceController, OrganizationsController],
      providers: [
        FinanceService,
        DefaultHouseholdService,
        FinanceRepository,
        FinanceBoundaryGuard,
        { provide: DatabaseService, useValue: { db: database.db } },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            CORS_ORIGIN_LIST: ['https://quilt.test'],
            BETTER_AUTH_URL: 'http://localhost:3000',
          }),
        },
        {
          provide: AuthService,
          useValue: {
            auth: {
              api: {
                getSession: ({ headers }: { headers: Headers }) => {
                  const actor = headers
                    .get('cookie')
                    ?.replace('test-user=', '');
                  return Promise.resolve(
                    actor
                      ? {
                          user: {
                            id: actor,
                            emailVerified: actor !== 'unverified',
                          },
                          session: { id: 'test' },
                        }
                      : null,
                  );
                },
              },
            },
          },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    })(TestModule);
    app = await NestFactory.create<NestFastifyApplication>(
      TestModule,
      new FastifyAdapter(),
      { logger: false },
    );
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 30000);
  beforeEach(async () => {
    await database.pool.query(
      'TRUNCATE finance_records, finance_operations, finance_audit, member, invitation, organization, "user" CASCADE',
    );
    for (const actor of ['owner', 'editor', 'viewer', 'outsider', 'unverified'])
      await database.pool.query(
        'INSERT INTO "user" (id, name, email, email_verified) VALUES ($1,$1,$2,true)',
        [actor, `${actor}@example.test`],
      );
    await database.pool.query(
      "INSERT INTO organization (id, name, slug) VALUES ('w1','First household','first'),('w2','Other household','other')",
    );
    for (const actor of ['owner', 'editor', 'viewer'])
      await database.pool.query(
        "INSERT INTO member (id, organization_id, user_id, role) VALUES ($1,'w1',$1,$1)",
        [actor],
      );
    await database.pool.query(
      "INSERT INTO member (id, organization_id, user_id, role) VALUES ('outsider','w2','outsider','owner')",
    );
  });
  afterAll(async () => {
    await app?.close();
    await database?.pool.end();
    if (admin) {
      await admin.pool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      await admin.pool.end();
    }
  });
  const request = (
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    actor = 'owner',
    payload?: Record<string, unknown>,
    origin?: string,
  ) =>
    app.inject({
      method,
      url: `/api/workspaces/${path}`,
      headers: {
        ...(actor ? { cookie: `test-user=${actor}` } : {}),
        ...(origin ? { origin } : {}),
      },
      ...(payload ? { payload } : {}),
    });
  const create = (
    resource: string,
    data: unknown,
    actor = 'owner',
    workspace = 'w1',
    operationId = randomUUID(),
  ) =>
    request('POST', `${workspace}/${resource}`, actor, { operationId, data });
  const account = async (actor = 'owner', workspace = 'w1') => {
    const response = await create('accounts', accountData(), actor, workspace);
    expect(response.statusCode, response.body).toBe(201);
    return FinanceRecordSchemas.accounts.parse(response.json());
  };

  it('creates one default household and owner membership across concurrent launches', async () => {
    await database.pool.query(
      'INSERT INTO "user" (id, name, email, email_verified) VALUES ($1,$2,$3,true)',
      ['new-user', 'Alex', 'new@example.test'],
    );
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/organizations/default',
          headers: { cookie: 'test-user=new-user' },
        }),
      ),
    );
    const households = responses.map((response) => {
      expect(response.statusCode, response.body).toBe(201);
      return response.json() as { id: string; name: string };
    });
    expect(new Set(households.map((h) => h.id)).size).toBe(1);
    expect(households[0]?.name).toBe('My household');
    const memberships = await database.pool.query(
      'SELECT organization_id, role FROM member WHERE user_id=$1',
      ['new-user'],
    );
    expect(memberships.rows).toEqual([
      { organization_id: households[0]?.id, role: 'owner' },
    ]);
    const opened = await request(
      'GET',
      `${households[0]!.id}/accounts`,
      'new-user',
    );
    expect(opened.statusCode, opened.body).toBe(200);
  });

  it('reuses an existing household and refuses setup without a verified session', async () => {
    const existing = await app.inject({
      method: 'POST',
      url: '/api/organizations/default',
      headers: { cookie: 'test-user=owner' },
    });
    expect(existing.statusCode, existing.body).toBe(201);
    expect(existing.json()).toMatchObject({
      id: 'w1',
      name: 'First household',
    });
    expect(
      (await database.pool.query('SELECT id FROM organization')).rows,
    ).toHaveLength(2);
    for (const actor of ['', 'unverified']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/organizations/default',
        headers: actor ? { cookie: `test-user=${actor}` } : {},
      });
      expect(response.statusCode).toBe(actor ? 403 : 401);
    }
  });

  it('requires verified authentication, checks current membership, and blocks viewer writes', async () => {
    expect((await request('GET', 'w1/accounts', '')).statusCode).toBe(401);
    expect((await request('GET', 'w1/accounts', 'unverified')).statusCode).toBe(
      403,
    );
    expect((await request('GET', 'w1/accounts', 'outsider')).statusCode).toBe(
      404,
    );
    expect((await create('accounts', accountData(), 'viewer')).statusCode).toBe(
      403,
    );
    expect((await request('GET', 'w1/accounts', 'viewer')).statusCode).toBe(
      200,
    );
    await account('editor');
    await database.pool.query("DELETE FROM member WHERE user_id='editor'");
    expect((await request('GET', 'w1/accounts', 'editor')).statusCode).toBe(
      404,
    );
  });
  it('returns only the current household access and effective role', async () => {
    expect((await request('GET', 'w1/access', 'viewer')).json()).toEqual({
      id: 'w1',
      name: 'First household',
      role: 'viewer',
    });
    expect((await request('GET', 'w1/access', 'owner')).json().role).toBe(
      'owner',
    );
    expect((await request('GET', 'w1/access', 'outsider')).statusCode).toBe(
      404,
    );
  });
  it('filters history before counting and paging, including literal merchant searches', async () => {
    const a = await account();
    const b = await account();
    const merchantResponse = await create('merchants', {
      name: 'Market 100%',
      aliases: [],
      archived: false,
    });
    expect(merchantResponse.statusCode, merchantResponse.body).toBe(201);
    const merchant = FinanceRecordSchemas.merchants.parse(
      merchantResponse.json(),
    );
    for (let i = 0; i < 2; i++) {
      expect(
        (
          await create('transactions', {
            ...expenseData(a.id),
            merchantId: merchant.id,
          })
        ).statusCode,
      ).toBe(201);
    }
    await create('transactions', {
      ...expenseData(b.id),
      note: 'Other purchase',
    });
    const query = `w1/transactions?accountId=${a.id}&kind=expense&status=booked&month=2026-01&voided=active&search=100%25&limit=1&offset=1`;
    const page = await request('GET', query, 'viewer');
    expect(page.statusCode, page.body).toBe(200);
    expect(page.json()).toMatchObject({ total: 2, limit: 1, offset: 1 });
    expect(page.json().items).toHaveLength(1);
    expect(page.json().items[0].accountId).toBe(a.id);
    expect(
      (await request('GET', 'w1/transactions?search=100_')).json().total,
    ).toBe(0);
    expect(
      (await request('GET', 'w1/transactions?month=2026-02')).json().total,
    ).toBe(0);
  });
  it('hides foreign records and rejects cross-workspace references', async () => {
    const foreign = await account('outsider', 'w2');
    expect((await request('GET', `w1/accounts/${foreign.id}`)).statusCode).toBe(
      404,
    );
    expect(
      (await create('transactions', expenseData(foreign.id))).statusCode,
    ).toBe(400);
    expect((await request('GET', 'w1/accounts')).json()).toMatchObject({
      items: [],
      total: 0,
    });
  });
  it('rejects client metadata, cross-site writes, and unbounded pages', async () => {
    expect(
      (
        await create('accounts', {
          ...accountData(),
          workspaceId: 'w2',
          createdBy: 'outsider',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request(
          'POST',
          'w1/accounts',
          'owner',
          { operationId: randomUUID(), data: accountData() },
          'https://evil.test',
        )
      ).statusCode,
    ).toBe(403);
    expect((await request('GET', 'w1/accounts?limit=101')).statusCode).toBe(
      400,
    );
    const response = await request('GET', 'w1/accounts');
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('creates exactly one audited record for concurrent retries and rejects key reuse', async () => {
    const operationId = randomUUID();
    const responses = await Promise.all([
      create('accounts', accountData(), 'owner', 'w1', operationId),
      create('accounts', accountData(), 'owner', 'w1', operationId),
    ]);
    expect(responses.map((r) => r.statusCode)).toEqual([201, 201]);
    expect(responses[0]!.json()).toEqual(responses[1]!.json());
    expect((await request('GET', 'w1/accounts')).json()).toMatchObject({
      total: 1,
    });
    expect(
      (
        await create(
          'accounts',
          accountData('Different'),
          'owner',
          'w1',
          operationId,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (await database.pool.query('SELECT * FROM finance_audit')).rowCount,
    ).toBe(1);
    await database.pool.query("DELETE FROM member WHERE user_id='owner'");
    expect(
      (await create('accounts', accountData(), 'owner', 'w1', operationId))
        .statusCode,
    ).toBe(404);
  });
  it('uses compare-and-set versions under concurrent editing', async () => {
    const a = await account();
    const responses = await Promise.all(
      ['First edit', 'Second edit'].map((name) =>
        request('PUT', `w1/accounts/${a.id}`, 'editor', {
          operationId: randomUUID(),
          expectedVersion: 1,
          data: accountData(name),
        }),
      ),
    );
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const saved = FinanceRecordSchemas.accounts.parse(
      (await request('GET', `w1/accounts/${a.id}`)).json(),
    );
    expect(saved.version).toBe(2);
    expect(saved.name).not.toBe(a.name);
    expect(saved.updatedBy).toBe('editor');
  });
  it('uses exact domain allocations and commits transfers atomically', async () => {
    const a = await account();
    const b = await account();
    const expense = {
      ...expenseData(a.id, '0.30'),
      allocations: [
        { key: 'one', categoryId: null, amount: amount('0.10') },
        { key: 'two', categoryId: null, amount: amount('0.20') },
      ],
    };
    expect((await create('transactions', expense)).statusCode).toBe(201);
    expect(
      (await create('transactions', { ...expense, amount: amount('0.31') }))
        .statusCode,
    ).toBe(400);
    const transfer = {
      kind: 'transfer',
      debit: { accountId: a.id, amount: amount('20') },
      credit: { accountId: b.id, amount: amount('19') },
      status: 'booked',
      occurredOn: '2026-01-03',
      bookedOn: '2026-01-03',
      note: null,
      tagIds: [],
    };
    expect((await create('transactions', transfer)).statusCode).toBe(400);
    expect(
      (
        await create('transactions', {
          ...transfer,
          credit: { accountId: b.id, amount: amount('20') },
        })
      ).statusCode,
    ).toBe(201);
    const summary = (
      await request(
        'GET',
        'w1/summary?month=2026-01&currency=EUR&asOf=2026-01-31',
      )
    ).json();
    expect(summary.cashFlow.expenses.amount).toBe('0.3');
    expect(summary.balances).toEqual(
      expect.arrayContaining([
        { accountId: a.id, balance: amount('979.7') },
        { accountId: b.id, balance: amount('1020') },
      ]),
    );
  });
  it('caps linked refunds and prevents voiding or editing their original expense', async () => {
    const a = await account();
    const expense = FinanceRecordSchemas.transactions.parse(
      (await create('transactions', expenseData(a.id))).json(),
    );
    const refund = {
      ...expenseData(a.id, '6'),
      kind: 'refund',
      refundOf: expense.id,
    };
    expect((await create('transactions', refund)).statusCode).toBe(201);
    expect(
      (
        await create('transactions', {
          ...refund,
          amount: amount('5'),
          allocations: [
            { key: 'whole', categoryId: null, amount: amount('5') },
          ],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request('POST', `w1/transactions/${expense.id}/void`, 'owner', {
          operationId: randomUUID(),
          expectedVersion: 1,
          reason: 'Correction',
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request('PUT', `w1/accounts/${a.id}`, 'owner', {
          operationId: randomUUID(),
          expectedVersion: 1,
          data: { ...accountData(), openingBalance: amount('999') },
        })
      ).statusCode,
    ).toBe(409);
  });
  it('archives catalog entries while preserving history and rejects new references', async () => {
    const a = await account();
    const category = FinanceRecordSchemas.categories.parse(
      (
        await create('categories', {
          name: 'Food',
          kind: 'expense',
          archived: false,
        })
      ).json(),
    );
    const expense = {
      ...expenseData(a.id),
      allocations: [
        { key: 'whole', categoryId: category.id, amount: amount('10') },
      ],
    };
    expect((await create('transactions', expense)).statusCode).toBe(201);
    expect(
      (
        await request('PUT', `w1/categories/${category.id}`, 'owner', {
          operationId: randomUUID(),
          expectedVersion: 1,
          data: { name: 'Food', kind: 'expense', archived: true },
        })
      ).statusCode,
    ).toBe(200);
    expect((await create('transactions', expense)).statusCode).toBe(400);
    expect((await request('GET', 'w1/transactions')).json().total).toBe(1);
  });
  it('validates budgets and prevents concurrent goal withdrawals exceeding progress', async () => {
    expect(
      (
        await create('budgets', {
          name: 'Month',
          month: '2026-01',
          limit: amount('100'),
          lines: [{ id: randomUUID(), categoryId: null, limit: amount('101') }],
          archived: false,
        })
      ).statusCode,
    ).toBe(400);
    const goal = FinanceRecordSchemas.goals.parse(
      (
        await create('goals', {
          name: 'Holiday',
          startsOn: '2026-01-01',
          targetOn: null,
          progressMode: 'tracked',
          target: amount('500'),
          archived: false,
        })
      ).json(),
    );
    const contribution = {
      goalId: goal.id,
      kind: 'contribution',
      amount: amount('100'),
      occurredOn: '2026-01-02',
      transactionId: null,
    };
    expect((await create('contributions', contribution)).statusCode).toBe(201);
    const results = await Promise.all([
      create('contributions', {
        ...contribution,
        kind: 'withdrawal',
        amount: amount('60'),
      }),
      create('contributions', {
        ...contribution,
        kind: 'withdrawal',
        amount: amount('60'),
      }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 400]);
  });
  it('restricts workspace preference writes to owners', async () => {
    const data = { reportingCurrency: 'EUR', timeZone: 'Europe/Paris' };
    expect((await create('settings', data, 'editor')).statusCode).toBe(403);
    expect((await create('settings', data)).statusCode).toBe(201);
    expect((await create('settings', data)).statusCode).toBe(409);
    expect((await request('GET', 'w1/settings', 'viewer')).statusCode).toBe(
      200,
    );
  });
  it('keeps legacy members as editors and fails closed on unknown or multiple roles', async () => {
    await database.pool.query(
      "UPDATE member SET role='admin' WHERE user_id='editor'",
    );
    await account('editor');
    expect(
      (
        await create(
          'settings',
          { reportingCurrency: 'EUR', timeZone: 'UTC' },
          'editor',
        )
      ).statusCode,
    ).toBe(403);
    await database.pool.query(
      "UPDATE member SET role='owner,viewer' WHERE user_id='editor'",
    );
    expect((await request('GET', 'w1/accounts', 'editor')).statusCode).toBe(
      403,
    );
  });
  it('reports actual cash flow, isolates currencies, and safely voids and restores activity', async () => {
    const a = await account();
    const expense = FinanceRecordSchemas.transactions.parse(
      (await create('transactions', expenseData(a.id))).json(),
    );
    expect(
      (
        await create('transactions', {
          ...expenseData(a.id, '100'),
          kind: 'income',
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await create('transactions', {
          ...expenseData(a.id, '2'),
          kind: 'refund',
          refundOf: null,
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await create('transactions', {
          ...expenseData(a.id, '1'),
          status: 'pending',
          bookedOn: null,
        })
      ).statusCode,
    ).toBe(201);
    const usd = FinanceRecordSchemas.accounts.parse(
      (
        await create('accounts', {
          ...accountData(),
          currency: 'USD',
          openingBalance: amount('100', 'USD'),
        })
      ).json(),
    );
    expect(
      (
        await create('transactions', {
          ...expenseData(usd.id, '5'),
          amount: amount('5', 'USD'),
          allocations: [
            { key: 'whole', categoryId: null, amount: amount('5', 'USD') },
          ],
        })
      ).statusCode,
    ).toBe(201);
    const report = async () =>
      (
        await request(
          'GET',
          'w1/summary?month=2026-01&currency=EUR&asOf=2026-01-31',
        )
      ).json();
    expect((await report()).cashFlow).toMatchObject({
      income: amount('100'),
      refunds: amount('2'),
      incoming: amount('102'),
      expenses: amount('10'),
      net: amount('92'),
    });
    expect(
      (
        await request('POST', `w1/transactions/${expense.id}/void`, 'owner', {
          operationId: randomUUID(),
          expectedVersion: 1,
          reason: 'Test correction',
        })
      ).statusCode,
    ).toBe(200);
    expect((await report()).cashFlow.expenses).toEqual(amount('0'));
    expect(
      (
        await request(
          'POST',
          `w1/transactions/${expense.id}/restore`,
          'owner',
          {
            operationId: randomUUID(),
            expectedVersion: 2,
            reason: 'Restore reviewed purchase',
          },
        )
      ).statusCode,
    ).toBe(200);
    expect((await report()).cashFlow.expenses).toEqual(amount('10'));
  });
  it('derives budget and goal progress on the server without another financial movement', async () => {
    const a = await account();
    await create('transactions', expenseData(a.id, '10'));
    const budget = FinanceRecordSchemas.budgets.parse(
      (
        await create('budgets', {
          name: 'January',
          month: '2026-01',
          limit: amount('100'),
          lines: [{ id: randomUUID(), categoryId: null, limit: amount('50') }],
          archived: false,
        })
      ).json(),
    );
    const result = await request(
      'GET',
      `w1/budgets/${budget.id}/progress?asOf=2026-01-31`,
    );
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({
      spent: amount('10'),
      remaining: amount('90'),
      lines: [{ spent: amount('10'), remaining: amount('40') }],
    });
    const goal = FinanceRecordSchemas.goals.parse(
      (
        await create('goals', {
          name: 'Future',
          startsOn: '2026-01-01',
          targetOn: null,
          progressMode: 'tracked',
          target: amount('500'),
          archived: false,
        })
      ).json(),
    );
    await create('contributions', {
      goalId: goal.id,
      kind: 'contribution',
      amount: amount('100'),
      occurredOn: '2026-01-02',
      transactionId: null,
    });
    const progress = await request(
      'GET',
      `w1/goals/${goal.id}/progress?asOf=2026-01-31`,
      'viewer',
    );
    expect(progress.statusCode).toBe(200);
    expect(progress.json().progress).toEqual(amount('100'));
    expect((await request('GET', 'w1/transactions')).json().total).toBe(1);
  });
});
