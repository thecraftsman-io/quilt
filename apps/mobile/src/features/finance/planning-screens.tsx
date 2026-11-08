import { useCallback, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { FinanceRecordMap } from '@quilt/contracts';
import { Button, Card, Text, TextField, View } from '@quilt/ui';
import { financeApi } from '../../lib/client/finance';
import { useFinance } from './finance-context';
import { useAction, useRecord, useRemote, workspaceToday } from './hooks';
import {
  Choices,
  Empty,
  ErrorMessage,
  Page,
  Picker,
  Progress,
  ReadOnly,
  RemoteState,
  Row,
  useNavigate,
} from './components';
import { display } from './model';

type Budget = FinanceRecordMap['budgets'];
type Goal = FinanceRecordMap['goals'];
export function BudgetsScreen() {
  const { data } = useFinance();
  const go = useNavigate();
  const [month, setMonth] = useState(
    workspaceToday(data.settings[0]?.timeZone ?? 'UTC').slice(0, 7),
  );
  const budgets = data.budgets.filter((b) => b.month === month);
  return (
    <Page
      title="Budgets"
      subtitle="A plan for the month, in each currency."
      action={() => go('add-budget')}
      actionLabel="Add budget"
    >
      <TextField
        label="Month (YYYY-MM)"
        value={month}
        onChangeText={setMonth}
      />
      {budgets.map((budget) => (
        <BudgetCard key={budget.id} budget={budget} />
      ))}
      {!budgets.length && (
        <Empty text="No budget for this month. Set an overall limit and optional category limits." />
      )}
    </Page>
  );
}
function BudgetCard({ budget }: { budget: Budget }) {
  const { workspaceId, data } = useFinance();
  const go = useNavigate();
  const date = workspaceToday(data.settings[0]?.timeZone ?? 'UTC');
  const result = useRemote(
    useCallback(
      (signal: AbortSignal) =>
        financeApi.budgetProgress(workspaceId, budget.id, date, signal),
      [workspaceId, budget.id, date],
    ),
  );
  return (
    <Card>
      <Row
        title={budget.name}
        subtitle={`${budget.month} · ${budget.limit.currency}${budget.archivedAt ? ' · Archived' : ''}`}
        trailing={display(budget.limit)}
        onPress={() => go('add-budget', { id: budget.id })}
      />
      {result.loading || result.error ? (
        <RemoteState loading={result.loading} error={result.error} />
      ) : (
        result.value && (
          <>
            <Text>
              {display(result.value.spent)} spent ·{' '}
              {display(result.value.remaining)} remaining
            </Text>
            <Progress
              value={Number(result.value.spent.amount)}
              total={Number(budget.limit.amount)}
            />
            {result.value.lines.map((line) => (
              <Text
                key={line.categoryId ?? 'uncategorized'}
                variant="caption"
                tone="textMuted"
              >
                {data.categories.find((c) => c.id === line.categoryId)?.name ??
                  'Uncategorized'}{' '}
                · {display(line.spent)} / {display(line.limit)}
              </Text>
            ))}
          </>
        )
      )}
    </Card>
  );
}
export function GoalsScreen() {
  const { data } = useFinance();
  const go = useNavigate();
  return (
    <Page
      title="Goals"
      subtitle="Something to look forward to, together."
      action={() => go('add-goal')}
      actionLabel="Add goal"
    >
      {data.goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} />
      ))}
      {!data.goals.length && (
        <Empty text="Set a target for your household’s next chapter." />
      )}
    </Page>
  );
}
function GoalCard({ goal }: { goal: Goal }) {
  const { workspaceId, data } = useFinance();
  const go = useNavigate();
  const date = workspaceToday(data.settings[0]?.timeZone ?? 'UTC');
  const progress = useRemote(
    useCallback(
      (signal: AbortSignal) =>
        financeApi.goalProgress(workspaceId, goal.id, date, signal),
      [workspaceId, goal.id, date],
    ),
  );
  return (
    <Card>
      <Row
        title={goal.name}
        subtitle={`${goal.targetOn ? `Target ${goal.targetOn}` : 'No deadline'}${goal.archivedAt ? ' · Archived' : ''}`}
        onPress={() => go('goal', { id: goal.id })}
      />
      {progress.loading || progress.error ? (
        <RemoteState loading={progress.loading} error={progress.error} />
      ) : (
        progress.value && (
          <>
            <Text>
              {display(progress.value.progress)} of {display(goal.target)}
            </Text>
            <Progress
              value={Number(progress.value.progress.amount)}
              total={Number(goal.target.amount)}
            />
          </>
        )
      )}
    </Card>
  );
}
export function PlanForm({ goal = false }: { goal?: boolean }) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { canEdit } = useFinance();
  const budgetRecord = useRecord('budgets', !goal ? id : undefined);
  const goalRecord = useRecord('goals', goal ? id : undefined);
  const result = goal ? goalRecord : budgetRecord;
  if (!canEdit) return <ReadOnly />;
  if (id && !result.record)
    return <RemoteState loading={result.loading} error={result.error} />;
  return goal ? (
    <GoalEditor key={id ?? 'new'} existing={goalRecord.record} />
  ) : (
    <BudgetEditor key={id ?? 'new'} existing={budgetRecord.record} />
  );
}
function BudgetEditor({ existing }: { existing?: Budget }) {
  const { data, create, update } = useFinance();
  const go = useNavigate();
  const action = useAction();
  const [baseline] = useState(existing);
  const [name, setName] = useState(existing?.name ?? '');
  const [limit, setLimit] = useState<string>(existing?.limit.amount ?? '');
  const [currency, setCurrency] = useState<string>(
    existing?.limit.currency ?? data.settings[0]?.reportingCurrency ?? 'EUR',
  );
  const [month, setMonth] = useState(
    existing?.month ??
      workspaceToday(data.settings[0]?.timeZone ?? 'UTC').slice(0, 7),
  );
  const [lines, setLines] = useState(
    (existing?.lines ?? []).map((l) => ({
      id: String(l.id),
      categoryId: l.categoryId ?? '',
      amount: String(l.limit.amount),
    })),
  );
  const [archived, setArchived] = useState(Boolean(existing?.archivedAt));
  const save = async () => {
    const result = await action.run(() => {
      const value = {
        name,
        month,
        limit: { amount: limit, currency },
        lines: lines.map((l) => ({
          id: l.id,
          categoryId: l.categoryId || null,
          limit: { amount: l.amount, currency },
        })),
        archived,
      };
      return baseline
        ? update('budgets', baseline.id, baseline.version, value)
        : create('budgets', value);
    });
    if (result) go('budgets', {}, true);
  };
  return (
    <Page
      title={baseline ? 'Edit budget' : 'Add budget'}
      subtitle="One monthly envelope per currency."
    >
      <Card>
        <TextField label="Budget name" value={name} onChangeText={setName} />
        <TextField
          label="Month (YYYY-MM)"
          value={month}
          onChangeText={setMonth}
        />
        <TextField
          label="Overall spending limit"
          value={limit}
          onChangeText={setLimit}
          keyboardType="decimal-pad"
        />
        <Choices
          label="Currency"
          value={currency}
          values={['EUR', 'USD', 'GBP']}
          onChange={setCurrency}
        />
        {lines.map((line, index) => (
          <View key={line.id} className="gap-3 border-b border-border pb-3">
            <Picker
              label={`Category ${index + 1}`}
              value={line.categoryId}
              options={[
                { id: '', name: 'Uncategorized' },
                ...data.categories.filter(
                  (c) => c.kind === 'expense' && !c.archivedAt,
                ),
              ]}
              onChange={(id) =>
                setLines((values) =>
                  values.map((v) =>
                    v.id === line.id ? { ...v, categoryId: id } : v,
                  ),
                )
              }
            />
            <TextField
              label="Category limit"
              value={line.amount}
              onChangeText={(v) =>
                setLines((values) =>
                  values.map((l) =>
                    l.id === line.id ? { ...l, amount: v } : l,
                  ),
                )
              }
              keyboardType="decimal-pad"
            />
            <Button
              label="Remove category line"
              variant="secondary"
              onPress={() =>
                setLines((values) => values.filter((l) => l.id !== line.id))
              }
            />
          </View>
        ))}
        <Button
          label="Add category limit"
          variant="secondary"
          disabled={lines.length >= 100}
          onPress={() =>
            setLines((values) => [
              ...values,
              {
                id: `line-${Date.now()}-${values.length}`,
                categoryId: '',
                amount: '',
              },
            ])
          }
        />
        {baseline && (
          <Choices
            label="Status"
            value={archived ? 'Archived' : 'Active'}
            values={['Active', 'Archived']}
            onChange={(v) => setArchived(v === 'Archived')}
          />
        )}
        <Text variant="caption" tone="textMuted">
          Category limits cannot exceed the overall limit. Spending follows
          activity dates; refunds reduce the month they are received.
        </Text>
        <ErrorMessage message={action.error} />
        <Button
          label="Save budget"
          loading={action.pending}
          onPress={() => {
            void save();
          }}
        />
      </Card>
    </Page>
  );
}
function GoalEditor({ existing }: { existing?: Goal }) {
  const { data, create, update } = useFinance();
  const go = useNavigate();
  const action = useAction();
  const [baseline] = useState(existing);
  const [name, setName] = useState(existing?.name ?? '');
  const [target, setTarget] = useState<string>(existing?.target.amount ?? '');
  const [currency, setCurrency] = useState<string>(
    existing?.target.currency ?? data.settings[0]?.reportingCurrency ?? 'EUR',
  );
  const [starts, setStarts] = useState(
    existing?.startsOn ?? workspaceToday(data.settings[0]?.timeZone ?? 'UTC'),
  );
  const [deadline, setDeadline] = useState(existing?.targetOn ?? '');
  const [archived, setArchived] = useState(Boolean(existing?.archivedAt));
  const save = async () => {
    const result = await action.run(() => {
      const value = {
        name,
        target: { amount: target, currency },
        startsOn: starts,
        targetOn: deadline || null,
        progressMode: 'tracked',
        archived,
      };
      return baseline
        ? update('goals', baseline.id, baseline.version, value)
        : create('goals', value);
    });
    if (result) go('goal', { id: result.id }, true);
  };
  return (
    <Page title={baseline ? 'Edit goal' : 'Add goal'}>
      <Card>
        <TextField label="Goal name" value={name} onChangeText={setName} />
        <TextField
          label="Target amount"
          value={target}
          onChangeText={setTarget}
          keyboardType="decimal-pad"
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
          label="Start date (YYYY-MM-DD)"
          value={starts}
          onChangeText={setStarts}
        />
        <TextField
          label="Target date (optional, YYYY-MM-DD)"
          value={deadline}
          onChangeText={setDeadline}
        />
        {baseline && (
          <Choices
            label="Status"
            value={archived ? 'Archived' : 'Active'}
            values={['Active', 'Archived']}
            onChange={(v) => setArchived(v === 'Archived')}
          />
        )}
        <ErrorMessage message={action.error} />
        <Button
          label="Save goal"
          loading={action.pending}
          onPress={() => {
            void save();
          }}
        />
      </Card>
    </Page>
  );
}
export function GoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useRecord('goals', id);
  if (!record.record)
    return <RemoteState loading={record.loading} error={record.error} />;
  return <GoalDetail goal={record.record} />;
}
function GoalDetail({ goal }: { goal: Goal }) {
  const { data, canEdit, create } = useFinance();
  const go = useNavigate();
  const action = useAction();
  const [kind, setKind] = useState('contribution');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(
    workspaceToday(data.settings[0]?.timeZone ?? 'UTC'),
  );
  const [transactionId, setTransactionId] = useState('');
  const [message, setMessage] = useState('');
  const transfers = data.transactions
    .filter(
      (t) => t.kind === 'transfer' && t.status === 'booked' && !t.voidedAt,
    )
    .map((t) => ({
      id: t.id,
      name: `${t.occurredOn} · ${t.kind === 'transfer' ? display(t.credit.amount) : ''}`,
    }));
  return (
    <Page
      title={goal.name}
      subtitle={goal.targetOn ? `Target ${goal.targetOn}` : 'No deadline'}
    >
      <GoalCard goal={goal} />
      {canEdit && (
        <Button
          variant="secondary"
          label="Edit goal"
          onPress={() => go('add-goal', { id: goal.id })}
        />
      )}
      {canEdit && !goal.archivedAt && (
        <Card>
          <Text variant="title">Update progress</Text>
          <Choices
            label="Type"
            value={kind}
            values={['contribution', 'withdrawal']}
            onChange={setKind}
          />
          <TextField
            label={`Amount (${goal.target.currency})`}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <TextField
            label="Date (YYYY-MM-DD)"
            value={date}
            onChangeText={setDate}
          />
          <Picker
            label="Link a recent transfer (optional)"
            value={transactionId}
            options={[{ id: '', name: 'Track without a link' }, ...transfers]}
            onChange={setTransactionId}
          />
          <Text variant="caption" tone="textMuted">
            Progress does not move money. Record a transfer separately if money
            actually moved.
          </Text>
          <ErrorMessage message={action.error} />
          {Boolean(message) && <Text aria-live="polite">{message}</Text>}
          <Button
            label="Save progress"
            loading={action.pending}
            onPress={() => {
              void action
                .run(() =>
                  create('contributions', {
                    goalId: goal.id,
                    kind,
                    amount: { amount, currency: goal.target.currency },
                    occurredOn: date,
                    transactionId: transactionId || null,
                  }),
                )
                .then((result) => {
                  if (result) {
                    setAmount('');
                    setMessage('Progress saved.');
                  }
                });
            }}
          />
        </Card>
      )}
    </Page>
  );
}
