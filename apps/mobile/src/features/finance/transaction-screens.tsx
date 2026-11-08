import { useCallback, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { FinanceRecordMap, FinanceListQuery } from '@quilt/contracts';
import { Button, Card, Text, TextField, View } from '@quilt/ui';
import { financeApi } from '../../lib/client/finance';
import { useFinance } from './finance-context';
import { useAction, useRecord, useRemote, workspaceToday } from './hooks';
import {
  AccountChoice,
  Choices,
  Empty,
  EntryRow,
  ErrorMessage,
  Page,
  Picker,
  ReadOnly,
  RemoteState,
  useNavigate,
} from './components';
import { display } from './model';

type Transaction = FinanceRecordMap['transactions'];
export function TransactionsScreen() {
  const { workspaceId } = useFinance();
  const params = useLocalSearchParams<{ accountId?: string }>();
  const go = useNavigate();
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [offset, setOffset] = useState(0);
  const request = useCallback(
    (signal: AbortSignal) => {
      const query: Partial<FinanceListQuery> = {
        limit: 50,
        offset,
        search,
        accountId: params.accountId
          ? (params.accountId as FinanceListQuery['accountId'])
          : undefined,
        voided: filter === 'Voided' ? 'voided' : 'active',
      };
      if (filter === 'pending') query.status = 'pending';
      else if (
        filter === 'expense' ||
        filter === 'income' ||
        filter === 'refund' ||
        filter === 'transfer' ||
        filter === 'adjustment'
      )
        query.kind = filter;
      return financeApi.list(workspaceId, 'transactions', query, signal);
    },
    [workspaceId, search, filter, offset, params.accountId],
  );
  const result = useRemote(request);
  return (
    <Page
      title="Transactions"
      subtitle="Your household’s activity."
      action={() =>
        go(
          'add-transaction',
          params.accountId ? { accountId: params.accountId } : {},
        )
      }
      actionLabel="Add transaction"
    >
      <TextField
        label="Search transactions"
        placeholder="Merchant, note, or adjustment reason"
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={() => {
          setSearch(draft);
          setOffset(0);
        }}
      />
      <Button
        variant="secondary"
        label="Search"
        onPress={() => {
          setSearch(draft);
          setOffset(0);
        }}
      />
      <Choices
        label="Show"
        value={filter}
        values={[
          'All',
          'expense',
          'income',
          'transfer',
          'refund',
          'pending',
          'Voided',
        ]}
        onChange={(value) => {
          setFilter(value);
          setOffset(0);
        }}
      />
      {Boolean(params.accountId) && (
        <Button
          variant="secondary"
          label="Show all accounts"
          onPress={() => go('transactions', {}, true)}
        />
      )}
      {result.loading || result.error ? (
        <RemoteState loading={result.loading} error={result.error} />
      ) : result.value?.items.length ? (
        <Card>
          {result.value.items.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </Card>
      ) : (
        <Empty text="No matching transactions. Add a transaction or adjust the filters." />
      )}
      {result.value && (
        <View className="gap-3">
          <Text variant="caption" tone="textMuted">
            {result.value.total === 0 ? '0' : offset + 1}–
            {Math.min(offset + result.value.items.length, result.value.total)}{' '}
            of {result.value.total}
          </Text>
          <View className="flex-row gap-2">
            <Button
              variant="secondary"
              label="Previous page"
              disabled={offset === 0}
              onPress={() => setOffset(Math.max(0, offset - 50))}
            />
            <Button
              variant="secondary"
              label="Next page"
              disabled={offset + 50 >= result.value.total}
              onPress={() => setOffset(offset + 50)}
            />
          </View>
        </View>
      )}
    </Page>
  );
}
export function TransactionForm() {
  const params = useLocalSearchParams<{
    id?: string;
    accountId?: string;
    refundOf?: string;
  }>();
  const { canEdit, data } = useFinance();
  const existing = useRecord('transactions', params.id);
  const original = useRecord('transactions', params.refundOf);
  if (!canEdit) return <ReadOnly />;
  if (params.id && !existing.record)
    return <RemoteState loading={existing.loading} error={existing.error} />;
  if (params.refundOf && !original.record)
    return <RemoteState loading={original.loading} error={original.error} />;
  if (!data.accounts.some((a) => !a.archivedAt))
    return (
      <Page title="Add transaction">
        <Empty text="Add an account before recording activity." />
      </Page>
    );
  return (
    <TransactionEditor
      key={params.id ?? params.refundOf ?? 'new'}
      existing={existing.record}
      original={original.record}
      accountId={params.accountId}
    />
  );
}
function TransactionEditor({
  existing,
  original,
  accountId: preferred,
}: {
  existing?: Transaction;
  original?: Transaction;
  accountId?: string;
}) {
  const { data, create, update } = useFinance();
  const go = useNavigate();
  const action = useAction();
  const [baseline] = useState(existing);
  const dateNow = workspaceToday(data.settings[0]?.timeZone ?? 'UTC');
  const [kind, setKind] = useState<Transaction['kind']>(
    existing?.kind ?? (original ? 'refund' : 'expense'),
  );
  const [accountId, setAccountId] = useState(
    existing
      ? existing.kind === 'transfer'
        ? existing.debit.accountId
        : existing.accountId
      : (preferred ??
          (original && original.kind !== 'transfer'
            ? original.accountId
            : undefined) ??
          data.accounts.find((a) => !a.archivedAt)?.id ??
          ''),
  );
  const [destination, setDestination] = useState(
    existing?.kind === 'transfer' ? existing.credit.accountId : '',
  );
  const [amount, setAmount] = useState<string>(
    existing
      ? existing.kind === 'transfer'
        ? existing.debit.amount.amount
        : existing.kind === 'adjustment'
          ? existing.delta.amount
          : existing.amount.amount
      : '',
  );
  const [received, setReceived] = useState<string>(
    existing?.kind === 'transfer' ? existing.credit.amount.amount : '',
  );
  const [date, setDate] = useState(existing?.occurredOn ?? dateNow);
  const [bookedDate, setBookedDate] = useState(existing?.bookedOn ?? dateNow);
  const [status, setStatus] = useState(existing?.status ?? 'booked');
  const [merchantId, setMerchantId] = useState(
    existing && 'merchantId' in existing ? (existing.merchantId ?? '') : '',
  );
  const initialAllocations =
    existing && 'allocations' in existing
      ? existing.allocations
      : original && 'allocations' in original
        ? original.allocations
        : [];
  const [allocations, setAllocations] = useState(
    initialAllocations.map((a) => ({
      key: a.key,
      categoryId: a.categoryId ?? '',
      amount: String(a.amount.amount),
    })),
  );
  const [categoryId, setCategoryId] = useState(
    initialAllocations[0]?.categoryId ?? '',
  );
  const [split, setSplit] = useState(initialAllocations.length > 1);
  const [note, setNote] = useState(existing?.note ?? '');
  const [reason, setReason] = useState(
    existing?.kind === 'adjustment' ? existing.reason : '',
  );
  const [tagIds, setTagIds] = useState<string[]>(existing?.tagIds ?? []);
  const account = data.accounts.find((a) => a.id === accountId);
  const target = data.accounts.find((a) => a.id === destination);
  const categories = [
    { id: '', name: 'Uncategorized' },
    ...data.categories.filter(
      (c) =>
        !c.archivedAt && c.kind === (kind === 'income' ? 'income' : 'expense'),
    ),
  ];
  const save = async () => {
    const result = await action.run(() => {
      if (!account) throw new Error('Select an account.');
      const common = {
        occurredOn: date,
        status,
        bookedOn: status === 'booked' ? bookedDate : null,
        note: note.trim() || null,
        tagIds,
      };
      let value: unknown;
      if (kind === 'transfer') {
        if (!target) throw new Error('Select a destination account.');
        value = {
          ...common,
          kind,
          debit: { accountId, amount: { amount, currency: account.currency } },
          credit: {
            accountId: destination,
            amount: {
              amount: target.currency === account.currency ? amount : received,
              currency: target.currency,
            },
          },
        };
      } else if (kind === 'adjustment')
        value = {
          ...common,
          kind,
          accountId,
          delta: { amount, currency: account.currency },
          reason,
        };
      else
        value = {
          ...common,
          kind,
          accountId,
          amount: { amount, currency: account.currency },
          merchantId: merchantId || null,
          allocations: split
            ? allocations.map((a) => ({
                key: a.key,
                categoryId: a.categoryId || null,
                amount: { amount: a.amount, currency: account.currency },
              }))
            : [
                {
                  key: 'whole',
                  categoryId: categoryId || null,
                  amount: { amount, currency: account.currency },
                },
              ],
          ...(kind === 'refund'
            ? {
                refundOf:
                  original?.id ??
                  (baseline?.kind === 'refund' ? baseline.refundOf : null),
              }
            : {}),
        };
      return baseline
        ? update('transactions', baseline.id, baseline.version, value)
        : create('transactions', value);
    });
    if (result) go('transaction', { id: result.id }, true);
  };
  return (
    <Page
      title={
        baseline
          ? 'Edit transaction'
          : original
            ? 'Record refund'
            : 'Add transaction'
      }
    >
      <Card>
        {!baseline && !original && (
          <Choices
            label="Type"
            value={kind}
            values={['expense', 'income', 'transfer', 'refund']}
            onChange={(v) => {
              if (
                v === 'expense' ||
                v === 'income' ||
                v === 'transfer' ||
                v === 'refund'
              ) {
                setKind(v);
                setCategoryId('');
                setSplit(false);
              }
            }}
          />
        )}
        <TextField
          label={`Amount${account ? ` (${account.currency})` : ''}`}
          value={amount}
          onChangeText={setAmount}
          keyboardType={
            kind === 'adjustment' ? 'numbers-and-punctuation' : 'decimal-pad'
          }
          editable={!action.pending}
        />
        <AccountChoice
          label={kind === 'transfer' ? 'From account' : 'Account'}
          value={accountId}
          onChange={setAccountId}
        />
        {kind === 'transfer' ? (
          <>
            <AccountChoice
              label="To account"
              value={destination}
              onChange={setDestination}
              exclude={accountId}
            />
            {target && account && target.currency !== account.currency && (
              <TextField
                label={`Amount received (${target.currency})`}
                value={received}
                onChangeText={setReceived}
                keyboardType="decimal-pad"
              />
            )}
            <Text variant="caption" tone="textMuted">
              Record any transfer fee as a separate expense.
            </Text>
          </>
        ) : kind === 'adjustment' ? (
          <TextField label="Reason" value={reason} onChangeText={setReason} />
        ) : (
          <>
            <Picker
              label="Merchant or counterparty"
              value={merchantId}
              options={[
                { id: '', name: 'None' },
                ...data.merchants.filter((m) => !m.archivedAt),
              ]}
              onChange={setMerchantId}
            />
            <Text variant="caption" tone="textMuted">
              Manage merchants and categories under More → Organization.
            </Text>
            {!split ? (
              <Picker
                label="Category"
                value={categoryId}
                options={categories}
                onChange={setCategoryId}
              />
            ) : (
              allocations.map((allocation, index) => (
                <View
                  key={allocation.key}
                  className="gap-2 border-b border-border pb-4"
                >
                  <Picker
                    label={`Category ${index + 1}`}
                    value={allocation.categoryId}
                    options={categories}
                    onChange={(v) =>
                      setAllocations((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, categoryId: v } : row,
                        ),
                      )
                    }
                  />
                  <TextField
                    label={`Amount ${index + 1}`}
                    value={allocation.amount}
                    onChangeText={(v) =>
                      setAllocations((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, amount: v } : row,
                        ),
                      )
                    }
                    keyboardType="decimal-pad"
                  />
                  {allocations.length > 2 && (
                    <Button
                      label="Remove category line"
                      variant="secondary"
                      onPress={() =>
                        setAllocations((rows) =>
                          rows.filter((_, i) => i !== index),
                        )
                      }
                    />
                  )}
                </View>
              ))
            )}
            <Button
              variant="secondary"
              label={split ? 'Use one category' : 'Split between categories'}
              onPress={() => {
                if (!split && allocations.length < 2)
                  setAllocations([
                    { key: 'first', categoryId, amount: '' },
                    { key: 'second', categoryId: '', amount: '' },
                  ]);
                setSplit(!split);
              }}
            />
            {split && (
              <Button
                variant="secondary"
                label="Add category line"
                onPress={() =>
                  setAllocations((rows) => [
                    ...rows,
                    {
                      key: `line-${rows.length}-${Date.now()}`,
                      categoryId: '',
                      amount: '',
                    },
                  ])
                }
                disabled={allocations.length >= 50}
              />
            )}
          </>
        )}
        <TextField
          label="Activity date (YYYY-MM-DD)"
          value={date}
          onChangeText={setDate}
          editable={!action.pending}
        />
        <Choices
          label="Status"
          value={status}
          values={['booked', 'pending']}
          onChange={(v) => setStatus(v === 'pending' ? 'pending' : 'booked')}
        />
        {status === 'booked' && (
          <TextField
            label="Booking date (YYYY-MM-DD)"
            value={bookedDate}
            onChangeText={setBookedDate}
            editable={!action.pending}
          />
        )}
        <TextField
          label="Note"
          value={note}
          onChangeText={setNote}
          editable={!action.pending}
        />
        <View className="gap-2">
          <Text variant="label">Tags</Text>
          {data.tags
            .filter((tag) => !tag.archivedAt)
            .map((tag) => (
              <Button
                key={tag.id}
                variant={tagIds.includes(tag.id) ? 'primary' : 'secondary'}
                label={tag.name}
                onPress={() =>
                  setTagIds((ids) =>
                    ids.includes(tag.id)
                      ? ids.filter((id) => id !== tag.id)
                      : [...ids, tag.id],
                  )
                }
              />
            ))}
        </View>
        <ErrorMessage message={action.error} />
        <Button
          label="Save transaction"
          loading={action.pending}
          onPress={() => {
            void save();
          }}
        />
      </Card>
    </Page>
  );
}
export function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useRecord('transactions', id);
  if (!record.record)
    return <RemoteState loading={record.loading} error={record.error} />;
  return <TransactionDetail entry={record.record} />;
}
function TransactionDetail({ entry }: { entry: Transaction }) {
  const { data, canEdit, transactionState } = useFinance();
  const go = useNavigate();
  const action = useAction();
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const amount =
    entry.kind === 'transfer'
      ? entry.debit.amount
      : entry.kind === 'adjustment'
        ? entry.delta
        : entry.amount;
  const accountId =
    entry.kind === 'transfer' ? entry.debit.accountId : entry.accountId;
  const merchant =
    'merchantId' in entry
      ? data.merchants.find((m) => m.id === entry.merchantId)?.name
      : undefined;
  return (
    <Page
      title={
        merchant ||
        (entry.kind === 'transfer'
          ? 'Account transfer'
          : entry.kind === 'adjustment'
            ? 'Balance adjustment'
            : 'Transaction')
      }
      subtitle={`${entry.kind} · ${entry.voidedAt ? 'Voided' : entry.status}`}
    >
      <Card>
        <Text variant="display">{display(amount)}</Text>
        <Text>
          {data.accounts.find((a) => a.id === accountId)?.name} ·{' '}
          {entry.occurredOn}
        </Text>
        {Boolean(entry.bookedOn) && (
          <Text tone="textMuted">Booked {entry.bookedOn}</Text>
        )}
        {entry.kind === 'transfer' && (
          <Text>
            To{' '}
            {data.accounts.find((a) => a.id === entry.credit.accountId)?.name} ·{' '}
            {display(entry.credit.amount)}
          </Text>
        )}
        {'allocations' in entry &&
          entry.allocations.map((allocation) => (
            <Text key={allocation.key}>
              {data.categories.find((c) => c.id === allocation.categoryId)
                ?.name ?? 'Uncategorized'}{' '}
              · {display(allocation.amount)}
            </Text>
          ))}
        {Boolean(entry.note) && <Text>{entry.note}</Text>}
        {entry.kind === 'adjustment' && <Text>{entry.reason}</Text>}
        {entry.tagIds.map((tag) => (
          <Text key={tag} tone="textMuted">
            #{data.tags.find((t) => t.id === tag)?.name ?? tag}
          </Text>
        ))}
        {entry.kind === 'refund' && entry.refundOf && (
          <Button
            variant="secondary"
            label="View original expense"
            onPress={() => go('transaction', { id: entry.refundOf! })}
          />
        )}
      </Card>
      {canEdit && (
        <View className="gap-3">
          {!entry.voidedAt && (
            <>
              <Button
                label="Edit transaction"
                onPress={() => go('add-transaction', { id: entry.id })}
              />
              {entry.kind === 'expense' && (
                <Button
                  variant="secondary"
                  label="Record refund"
                  onPress={() => go('add-transaction', { refundOf: entry.id })}
                />
              )}
            </>
          )}
          {confirm ? (
            <Card>
              <Text>
                {entry.voidedAt
                  ? 'Restore this activity to balances and reports?'
                  : 'Void this activity? Its history will be retained.'}
              </Text>
              <TextField
                label="Reason"
                value={reason}
                onChangeText={setReason}
              />
              <ErrorMessage message={action.error} />
              <Button
                label={entry.voidedAt ? 'Confirm restore' : 'Confirm void'}
                loading={action.pending}
                onPress={() => {
                  void action
                    .run(() =>
                      transactionState(
                        entry.id,
                        entry.version,
                        entry.voidedAt ? 'restore' : 'void',
                        reason,
                      ),
                    )
                    .then((value) => {
                      if (value) setConfirm(false);
                    });
                }}
              />
              <Button
                label="Cancel"
                variant="secondary"
                disabled={action.pending}
                onPress={() => setConfirm(false)}
              />
            </Card>
          ) : (
            <Button
              variant="secondary"
              label={
                entry.voidedAt ? 'Restore transaction' : 'Void transaction'
              }
              onPress={() => setConfirm(true)}
            />
          )}
        </View>
      )}
    </Page>
  );
}
