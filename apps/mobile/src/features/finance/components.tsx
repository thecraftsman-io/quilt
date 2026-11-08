import type { PropsWithChildren } from 'react';
import { ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Button, Card, Pressable, Text, View, useQuiltTheme } from '@quilt/ui';
import { display } from './model';
import type { FinanceRecordMap } from '@quilt/contracts';
import { useFinance } from './finance-context';

export function AccountChoice({
  label = 'Account',
  value,
  onChange,
  exclude,
}: {
  label?: string;
  value: string;
  onChange: (id: string) => void;
  exclude?: string;
}) {
  const { data } = useFinance();
  return (
    <View className="gap-2">
      <Text variant="label">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {data.accounts
          .filter((a) => !a.archivedAt && a.id !== exclude)
          .map((a) => (
            <Pressable
              key={a.id}
              aria-pressed={value === a.id}
              onPress={() => onChange(a.id)}
              className={`min-h-[44px] p-3 rounded-[8px] border ${value === a.id ? 'border-primary bg-surfaceMuted' : 'border-border bg-surface'}`}
            >
              <Text variant="label">
                {a.name} · {a.currency}
              </Text>
            </Pressable>
          ))}
      </View>
    </View>
  );
}

export function useNavigate() {
  const router = useRouter();
  const { workspaceId } = useFinance();
  return (
    screen: string,
    params: Record<string, string> = {},
    replace = false,
  ) => {
    const href = {
      pathname: '/workspace/[workspaceId]/[screen]' as const,
      params: { screen, workspaceId, ...params },
    };
    if (replace) router.replace(href);
    else router.push(href);
  };
}
export function Choices({
  label,
  value,
  values,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <View className="gap-2">
      <Text variant="label">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {values.map((item) => (
          <Pressable
            key={item}
            aria-pressed={item === value}
            onPress={() => onChange(item)}
            className={`min-h-[44px] px-[14px] py-[11px] border rounded-[8px] ${item === value ? 'border-primary bg-surfaceMuted' : 'border-border bg-surface'}`}
          >
            <Text variant="label">{labels?.[item] ?? item}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function Page({
  title,
  subtitle,
  children,
  action,
  actionLabel,
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  action?: () => void;
  actionLabel?: string;
}>) {
  const { canEdit, data } = useFinance();
  return (
    <View className="gap-6">
      <View className="gap-4">
        <View className="gap-2">
          <Text variant="heading">{title}</Text>
          {Boolean(subtitle) && <Text tone="textMuted">{subtitle}</Text>}
          {data.workspace.role === 'viewer' && (
            <Text variant="caption" tone="textMuted">
              View only
            </Text>
          )}
        </View>
        {action && canEdit && (
          <View className="self-start">
            <Button label={actionLabel ?? 'Add new'} onPress={action} />
          </View>
        )}
      </View>
      {children}
    </View>
  );
}
export function Row({
  title,
  subtitle,
  trailing,
  onPress,
}: {
  title: string;
  subtitle?: string;
  trailing?: string;
  onPress?: () => void;
}) {
  const { colors } = useQuiltTheme();
  const content = (
    <View className="flex-row items-center gap-3 py-4 border-b border-border">
      <View className="flex-1 gap-1">
        <Text variant="label" className="text-left">
          {title}
        </Text>
        {Boolean(subtitle) && (
          <Text variant="caption" tone="textMuted" className="text-left">
            {subtitle}
          </Text>
        )}
      </View>
      {Boolean(trailing) && <Text variant="label">{trailing}</Text>}
      {onPress && (
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      )}
    </View>
  );
  return onPress ? (
    <Pressable aria-label={title} onPress={onPress}>
      {content}
    </Pressable>
  ) : (
    content
  );
}
export function Empty({
  text,
  action,
  label,
}: {
  text: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <Card>
      <Text tone="textMuted">{text}</Text>
      {action && (
        <Button
          variant="secondary"
          label={label ?? 'Get started'}
          onPress={action}
        />
      )}
    </Card>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <Text role="alert" tone="danger">
      {message}
    </Text>
  ) : null;
}
export function EntryRow({
  entry,
}: {
  entry: FinanceRecordMap['transactions'];
}) {
  const go = useNavigate();
  const { data } = useFinance();
  const merchant =
    'merchantId' in entry
      ? data.merchants.find((m) => m.id === entry.merchantId)?.name
      : undefined;
  const value =
    entry.kind === 'transfer'
      ? entry.debit.amount
      : entry.kind === 'adjustment'
        ? entry.delta
        : entry.amount;
  return (
    <Row
      title={
        merchant ||
        (entry.kind === 'transfer'
          ? 'Account transfer'
          : entry.kind === 'adjustment'
            ? 'Balance adjustment'
            : entry.kind === 'income'
              ? 'Income'
              : entry.kind === 'refund'
                ? 'Refund'
                : 'Expense')
      }
      subtitle={`${entry.occurredOn} · ${entry.voidedAt ? 'Voided' : entry.status} · ${entry.kind}`}
      trailing={`${entry.kind === 'expense' || entry.kind === 'transfer' ? '−' : entry.kind === 'adjustment' ? '' : '+'}${display(value)}`}
      onPress={() => go('transaction', { id: entry.id })}
    />
  );
}
export function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <View className="gap-2">
      <Text variant="label">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <Pressable
            key={option.id}
            aria-pressed={option.id === value}
            onPress={() => onChange(option.id)}
            className={`min-h-[44px] p-3 border rounded-[8px] ${option.id === value ? 'border-primary bg-surfaceMuted' : 'border-border bg-surface'}`}
          >
            <Text variant="label">{option.name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function RemoteState({
  loading,
  error,
}: {
  loading?: boolean;
  error?: string;
}) {
  const { colors } = useQuiltTheme();
  const { refresh } = useFinance();
  return (
    <Card>
      {loading ? (
        <ActivityIndicator aria-label="Loading" color={colors.primary} />
      ) : (
        <>
          <ErrorMessage message={error || 'This record could not be loaded.'} />
          <Button
            label="Try again"
            variant="secondary"
            onPress={() => {
              void refresh();
            }}
          />
        </>
      )}
    </Card>
  );
}
export function ReadOnly() {
  return (
    <Empty text="You have read-only access to this household. An owner can change your role." />
  );
}
export function Progress({ value, total }: { value: number; total: number }) {
  const percent = Math.max(0, Math.min(100, total ? (value / total) * 100 : 0));
  return (
    <View
      role="progressbar"
      aria-label="Progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      className="h-[5px] rounded-[3px] bg-surfaceMuted"
    >
      <View
        className="h-[5px] rounded-[3px] bg-primary"
        style={{ width: `${percent}%` }}
      />
    </View>
  );
}
