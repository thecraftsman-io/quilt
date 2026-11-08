import { useCallback, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { FinanceRecordMap } from '@quilt/contracts';
import { Button, Card, Text, TextField, View } from '@quilt/ui';
import { money, subtractMoney } from '@quilt/domain';
import { financeApi } from '../../lib/client/finance';
import { useFinance } from './finance-context';
import { useAction, useRecord, useRemote, workspaceToday } from './hooks';
import {
  Choices,
  Empty,
  ErrorMessage,
  Page,
  Row,
  RemoteState,
  useNavigate,
  ReadOnly,
} from './components';
import { display, today } from './model';

type Account = FinanceRecordMap['accounts'];
export function useBalances() {
  const { workspaceId, data } = useFinance();
  const date = workspaceToday(data.settings[0]?.timeZone ?? 'UTC');
  return useRemote(
    useCallback(
      (signal: AbortSignal) =>
        financeApi.summary(
          workspaceId,
          date.slice(0, 7),
          data.settings[0]?.reportingCurrency ?? 'EUR',
          date,
          signal,
        ),
      [workspaceId, date, data.settings],
    ),
  );
}
export function AccountsScreen() {
  const { data } = useFinance();
  const go = useNavigate();
  const summary = useBalances();
  return (
    <Page
      title="Accounts"
      subtitle="What your household holds and owes."
      action={() => go('add-account')}
      actionLabel="Add account"
    >
      {summary.loading || summary.error ? (
        <RemoteState loading={summary.loading} error={summary.error} />
      ) : null}
      {data.accounts.length ? (
        <Card>
          {data.accounts.map((a) => (
            <Row
              key={a.id}
              title={a.name}
              subtitle={`${a.kind} · ${a.currency}${a.archivedAt ? ' · Archived' : ''}`}
              trailing={
                summary.value?.balances.find((b) => b.accountId === a.id)
                  ?.balance
                  ? display(
                      summary.value.balances.find((b) => b.accountId === a.id)!
                        .balance,
                    )
                  : undefined
              }
              onPress={() => go('account', { id: a.id })}
            />
          ))}
        </Card>
      ) : (
        <Empty text="Add your first bank account, cash wallet, or credit card." />
      )}
    </Page>
  );
}
export function AccountForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { canEdit } = useFinance();
  const state = useRecord('accounts', id);
  if (!canEdit) return <ReadOnly />;
  if (id && !state.record)
    return <RemoteState loading={state.loading} error={state.error} />;
  return <AccountEditor key={id ?? 'new'} account={state.record} />;
}
function AccountEditor({ account }: { account?: Account }) {
  const { create, update, data } = useFinance();
  const go = useNavigate();
  const action = useAction();
  const [baseline] = useState(account);
  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState(account?.kind ?? 'bank');
  const [currency, setCurrency] = useState<string>(
    account?.currency ?? data.settings[0]?.reportingCurrency ?? 'EUR',
  );
  const [amount, setAmount] = useState<string>(
    account?.openingBalance.amount ?? '0',
  );
  const [date, setDate] = useState(account?.openingBalanceDate ?? today(-1));
  const save = async () => {
    const result = await action.run(() => {
      const value = {
        name,
        kind,
        currency,
        openingBalance: { amount, currency },
        openingBalanceDate: date,
        archived: Boolean(baseline?.archivedAt),
      };
      return baseline
        ? update('accounts', baseline.id, baseline.version, value)
        : create('accounts', value);
    });
    if (result) go('account', { id: result.id }, true);
  };
  return (
    <Page
      title={baseline ? 'Edit account' : 'Add account'}
      subtitle="Shared with all household members."
    >
      <Card>
        <TextField
          label="Account name"
          value={name}
          onChangeText={setName}
          editable={!action.pending}
        />
        <Choices
          label="Type"
          value={kind}
          values={['bank', 'cash', 'credit-card']}
          onChange={(v) => {
            if (v === 'bank' || v === 'cash' || v === 'credit-card') setKind(v);
          }}
        />
        {baseline ? (
          <Text>Currency: {currency}</Text>
        ) : (
          <Choices
            label="Currency"
            value={currency}
            values={['EUR', 'USD', 'GBP']}
            onChange={setCurrency}
          />
        )}
        <TextField
          label="Opening balance"
          hint={
            kind === 'credit-card'
              ? 'Use a negative amount for money owed.'
              : 'Your balance at the end of the date below.'
          }
          value={amount}
          onChangeText={setAmount}
          keyboardType="numbers-and-punctuation"
          editable={!action.pending}
        />
        <TextField
          label="Opening balance date"
          hint="YYYY-MM-DD. Activity on or before this date is included in the opening balance."
          value={date}
          onChangeText={setDate}
          editable={!action.pending}
        />
        <ErrorMessage message={action.error} />
        <Button
          label="Save account"
          loading={action.pending}
          onPress={() => {
            void save();
          }}
        />
      </Card>
    </Page>
  );
}
export function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useRecord('accounts', id);
  if (!state.record)
    return <RemoteState loading={state.loading} error={state.error} />;
  return <AccountDetail key={id} account={state.record} />;
}
function AccountDetail({ account }: { account: Account }) {
  const { canEdit, update } = useFinance();
  const go = useNavigate();
  const summary = useBalances();
  const action = useAction();
  const value = summary.value?.balances.find(
    (b) => b.accountId === account.id,
  )?.balance;
  return (
    <Page
      title={account.name}
      subtitle={`${account.kind} · ${account.currency}${account.archivedAt ? ' · Archived' : ''}`}
    >
      <Card>
        <Text tone="textMuted">Booked balance</Text>
        {summary.loading || summary.error ? (
          <RemoteState loading={summary.loading} error={summary.error} />
        ) : (
          <Text variant="display">
            {value
              ? display(value)
              : account.archivedAt
                ? 'Archived'
                : 'Not available'}
          </Text>
        )}
        <Text variant="caption" tone="textMuted">
          Pending transactions are excluded.
        </Text>
      </Card>
      {canEdit && (
        <View className="gap-2">
          {!account.archivedAt && (
            <Button
              label="Add transaction"
              onPress={() => go('add-transaction', { accountId: account.id })}
            />
          )}
          <Button
            variant="secondary"
            label="Edit account"
            onPress={() => go('add-account', { id: account.id })}
          />
          {!account.archivedAt && (
            <Button
              variant="secondary"
              label="Check statement balance"
              onPress={() => go('reconcile', { id: account.id })}
            />
          )}
          <Button
            variant="secondary"
            label={account.archivedAt ? 'Restore account' : 'Archive account'}
            loading={action.pending}
            onPress={() => {
              void action.run(() =>
                update('accounts', account.id, account.version, {
                  name: account.name,
                  kind: account.kind,
                  currency: account.currency,
                  openingBalance: account.openingBalance,
                  openingBalanceDate: account.openingBalanceDate,
                  archived: !account.archivedAt,
                }),
              );
            }}
          />
          <ErrorMessage message={action.error} />
        </View>
      )}
      <Button
        variant="secondary"
        label="View account activity"
        onPress={() => go('transactions', { accountId: account.id })}
      />
    </Page>
  );
}
export function ReconcileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useRecord('accounts', id);
  const { canEdit } = useFinance();
  if (!canEdit) return <ReadOnly />;
  if (!state.record)
    return <RemoteState loading={state.loading} error={state.error} />;
  return <BalanceCheck account={state.record} />;
}
function BalanceCheck({ account }: { account: Account }) {
  const { workspaceId, create, data } = useFinance();
  const action = useAction();
  const go = useNavigate();
  const dateNow = workspaceToday(data.settings[0]?.timeZone ?? 'UTC');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(dateNow);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [checked, setChecked] = useState<{
    delta: ReturnType<typeof money>;
    date: string;
    amount: string;
  }>();
  const compare = async () => {
    const result = await action.run(async () => {
      const report = await financeApi.summary(
        workspaceId,
        date.slice(0, 7),
        account.currency,
        date,
      );
      const calculated = report.balances.find(
        (b) => b.accountId === account.id,
      )?.balance;
      if (!calculated)
        throw new Error(
          'Choose a date on or after the account’s opening balance.',
        );
      return {
        delta: subtractMoney(money(amount, account.currency), calculated),
        date,
        amount,
      };
    });
    if (result) {
      setChecked(result);
      setMessage(
        result.delta.amount === '0'
          ? 'Your balances match.'
          : 'Review missing or duplicated activity before recording an adjustment.',
      );
    }
  };
  return (
    <Page title="Check statement balance" subtitle={account.name}>
      <Card>
        <TextField
          label="Statement date (YYYY-MM-DD)"
          value={date}
          onChangeText={(v) => {
            setDate(v);
            setChecked(undefined);
          }}
        />
        <TextField
          label={`Statement balance (${account.currency})`}
          value={amount}
          onChangeText={(v) => {
            setAmount(v);
            setChecked(undefined);
          }}
          keyboardType="numbers-and-punctuation"
        />
        <Button
          label="Compare balances"
          loading={action.pending}
          onPress={() => {
            void compare();
          }}
        />
        {Boolean(message) && <Text>{message}</Text>}
        {checked && checked.delta.amount !== '0' && (
          <>
            <Text variant="title">Difference: {display(checked.delta)}</Text>
            <TextField
              label="Reason for adjustment"
              value={reason}
              onChangeText={setReason}
            />
            <Button
              variant="secondary"
              label="Record balance adjustment"
              loading={action.pending}
              onPress={() => {
                void action
                  .run(() =>
                    create('transactions', {
                      kind: 'adjustment',
                      accountId: account.id,
                      delta: checked.delta,
                      reason,
                      occurredOn: checked.date,
                      bookedOn: checked.date,
                      status: 'booked',
                      note: null,
                      tagIds: [],
                    }),
                  )
                  .then((result) => {
                    if (result) go('transaction', { id: result.id }, true);
                  });
              }}
            />
          </>
        )}
        <ErrorMessage message={action.error} />
      </Card>
    </Page>
  );
}
