import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { addMoney, money } from '@quilt/domain';
import { Button, Card, Pressable, Text, View, useQuiltTheme } from '@quilt/ui';
import { useFinance } from './finance-context';
import { Empty, EntryRow, Page, RemoteState, useNavigate } from './components';
import { display } from './model';
import {
  AccountForm,
  AccountScreen,
  AccountsScreen,
  ReconcileScreen,
  useBalances,
} from './account-screens';
import {
  TransactionForm,
  TransactionScreen,
  TransactionsScreen,
} from './transaction-screens';
import {
  BudgetsScreen,
  GoalScreen,
  GoalsScreen,
  PlanForm,
} from './planning-screens';
import {
  CatalogScreen,
  InviteScreen,
  MembersScreen,
  MoreScreen,
  PlansScreen,
  SettingsScreen,
} from './settings-screens';
import { CashFlowChart } from './cash-flow-chart';
import { ScreenTransition } from '../../lib/navigation/motion';

const navigation = [
  { screen: 'overview', label: 'Home', icon: 'home' },
  { screen: 'accounts', label: 'Accounts', icon: 'credit-card' },
  { screen: 'transactions', label: 'Activity', icon: 'list' },
  { screen: 'plans', label: 'Plans', icon: 'pie-chart' },
  { screen: 'more', label: 'More', icon: 'grid' },
] as const;
function activeSection(screen: string) {
  if (['account', 'add-account', 'reconcile'].includes(screen))
    return 'accounts';
  if (['transaction', 'add-transaction'].includes(screen))
    return 'transactions';
  if (['budgets', 'add-budget', 'goals', 'goal', 'add-goal'].includes(screen))
    return 'plans';
  if (['settings', 'members', 'invite', 'catalog'].includes(screen))
    return 'more';
  return screen;
}
function OverviewScreen() {
  const { data, canEdit } = useFinance();
  const go = useNavigate();
  const report = useBalances();
  const balances = report.value?.balances ?? [];
  const currencies = [...new Set(balances.map((b) => b.balance.currency))];
  return (
    <Page
      title="A little clarity, every day."
      subtitle={data.workspace.name}
      action={() => go('add-transaction')}
      actionLabel="Add transaction"
    >
      {report.loading || report.error ? (
        <RemoteState loading={report.loading} error={report.error} />
      ) : (
        <View className="flex-row flex-wrap gap-4">
          {currencies.map((currency) => (
            <Card key={currency} className="grow basis-[220px]">
              <Text tone="textMuted">Account balances · {currency}</Text>
              <Text variant="heading">
                {display(
                  balances
                    .filter((b) => b.balance.currency === currency)
                    .reduce(
                      (sum, b) => addMoney(sum, b.balance),
                      money('0', currency),
                    ),
                )}
              </Text>
            </Card>
          ))}
        </View>
      )}
      {!data.accounts.length && (
        <Empty
          text="Start with an account to see your household’s money."
          action={canEdit ? () => go('add-account') : undefined}
          label="Add account"
        />
      )}
      <CashFlowChart />
      <Card>
        <View className="flex-row flex-wrap justify-between items-center gap-3">
          <Text variant="title">Recent activity</Text>
          <Button
            label="View all"
            variant="secondary"
            onPress={() => go('transactions')}
          />
        </View>
        {data.transactions.slice(0, 5).map((entry) => (
          <EntryRow key={entry.id} entry={entry} />
        ))}
        {!data.transactions.length && (
          <Text tone="textMuted">Your transactions will appear here.</Text>
        )}
      </Card>
    </Page>
  );
}
function ScreenContent({ screen }: { screen: string }) {
  switch (screen) {
    case 'overview':
      return <OverviewScreen />;
    case 'accounts':
      return <AccountsScreen />;
    case 'add-account':
      return <AccountForm />;
    case 'account':
      return <AccountScreen />;
    case 'reconcile':
      return <ReconcileScreen />;
    case 'transactions':
      return <TransactionsScreen />;
    case 'add-transaction':
      return <TransactionForm />;
    case 'transaction':
      return <TransactionScreen />;
    case 'plans':
      return <PlansScreen />;
    case 'budgets':
      return <BudgetsScreen />;
    case 'add-budget':
      return <PlanForm />;
    case 'goals':
      return <GoalsScreen />;
    case 'add-goal':
      return <PlanForm goal />;
    case 'goal':
      return <GoalScreen />;
    case 'more':
      return <MoreScreen />;
    case 'catalog':
      return <CatalogScreen />;
    case 'members':
      return <MembersScreen />;
    case 'invite':
      return <InviteScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return (
        <Page title="Page not found">
          <Empty text="Choose a section to continue." />
        </Page>
      );
  }
}
export function FinanceScreen() {
  const params = useLocalSearchParams<{
    screen: string;
    id?: string;
    accountId?: string;
    refundOf?: string;
  }>();
  const screen = params.screen ?? 'overview';
  const { data, workspaceId, refresh } = useFinance();
  const { colors } = useQuiltTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const go = useNavigate();
  const section = activeSection(screen);
  const nav = (
    <View className="justify-around flex-row gap-0 lg:flex-col lg:gap-2">
      {navigation.map((item) => (
        <Pressable
          key={item.screen}
          aria-label={item.label}
          aria-current={section === item.screen ? 'page' : undefined}
          onPress={() => {
            if (screen === item.screen) return;
            router.navigate({
              pathname: '/workspace/[workspaceId]/[screen]',
              params: { workspaceId, screen: item.screen },
            });
          }}
          className={`min-h-[56px] p-[10px] rounded-[8px] items-center press:opacity-70 flex-1 flex-col gap-1 lg:flex-none lg:flex-row lg:gap-3 ${section === item.screen ? 'bg-surfaceMuted' : ''}`}
        >
          <Feather
            name={item.icon}
            size={20}
            color={section === item.screen ? colors.primary : colors.textMuted}
          />
          <Text
            variant="caption"
            className="lg:text-sm lg:font-semibold"
            tone={section === item.screen ? 'text' : 'textMuted'}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-1 flex-row">
        <View className="hidden lg:flex w-[216px] p-5 border-r border-border gap-6">
          <Text variant="label">{data.workspace.name}</Text>
          {nav}
          <Button
            label="Households"
            variant="secondary"
            onPress={() => router.push('/households')}
          />
          <Button
            label="Refresh"
            variant="secondary"
            onPress={() => {
              void refresh();
            }}
          />
        </View>
        <ScreenTransition
          key={`${screen}-${params.id ?? ''}-${params.refundOf ?? ''}-${params.accountId ?? ''}`}
        >
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
            <View className="w-full max-w-[1040px] self-center gap-6 px-5 pt-5 pb-10 lg:p-10">
              {!navigation.some((n) => n.screen === screen) && (
                <View className="self-start">
                  <Button
                    variant="secondary"
                    label="← Back"
                    onPress={() =>
                      router.canGoBack() ? router.back() : go(section)
                    }
                  />
                </View>
              )}
              <ScreenContent
                key={`${screen}-${params.id ?? ''}-${params.refundOf ?? ''}-${params.accountId ?? ''}`}
                screen={screen}
              />
            </View>
          </ScrollView>
        </ScreenTransition>
      </View>
      <View
        className="border-t border-border bg-surface pt-[6px] lg:hidden"
        style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      >
        {nav}
      </View>
    </View>
  );
}
