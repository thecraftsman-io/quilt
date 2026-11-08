import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Button, Card, Text, View, useQuiltTheme } from '@quilt/ui';
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
  const { colors } = useQuiltTheme();
  return (
    <View className="gap-2">
      <Text variant="label">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {data.accounts
          .filter((a) => !a.archivedAt && a.id !== exclude)
          .map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              accessibilityState={{ selected: value === a.id }}
              onPress={() => onChange(a.id)}
              style={{
                minHeight: 44,
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: value === a.id ? colors.primary : colors.border,
                backgroundColor:
                  value === a.id ? colors.surfaceMuted : colors.surface,
              }}
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
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
}) {
  const { colors } = useQuiltTheme();
  return (
    <View className="gap-2">
      <Text variant="label">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {values.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: item === value }}
            onPress={() => onChange(item)}
            style={{
              minHeight: 44,
              paddingHorizontal: 14,
              paddingVertical: 11,
              borderWidth: 1,
              borderRadius: 8,
              borderColor: item === value ? colors.primary : colors.border,
              backgroundColor:
                item === value ? colors.surfaceMuted : colors.surface,
            }}
          >
            <Text variant="label">{item}</Text>
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
  const { canEdit } = useFinance();
  return (
    <View className="gap-6">
      <View className="gap-4">
        <View className="gap-2">
          <Text variant="heading">{title}</Text>
          {Boolean(subtitle) && <Text tone="textMuted">{subtitle}</Text>}
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
        <Text variant="label" style={{ textAlign: 'left' }}>
          {title}
        </Text>
        {Boolean(subtitle) && (
          <Text
            variant="caption"
            tone="textMuted"
            style={{ textAlign: 'left' }}
          >
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
    >
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
  const { colors } = useQuiltTheme();
  return (
    <View className="gap-2">
      <Text variant="label">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: option.id === value }}
            onPress={() => onChange(option.id)}
            style={{
              minHeight: 44,
              padding: 12,
              borderWidth: 1,
              borderRadius: 8,
              borderColor: option.id === value ? colors.primary : colors.border,
              backgroundColor:
                option.id === value ? colors.surfaceMuted : colors.surface,
            }}
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
        <ActivityIndicator
          accessibilityLabel="Loading"
          color={colors.primary}
        />
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
  const { colors } = useQuiltTheme();
  const percent = Math.max(0, Math.min(100, total ? (value / total) * 100 : 0));
  return (
    <View
      role="progressbar"
      aria-label="Progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      style={{
        height: 5,
        borderRadius: 3,
        backgroundColor: colors.surfaceMuted,
      }}
    >
      <View
        style={{
          height: 5,
          borderRadius: 3,
          width: `${percent}%`,
          backgroundColor: colors.primary,
        }}
      />
    </View>
  );
}
