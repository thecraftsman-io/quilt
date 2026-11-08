import { Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Button, Text, View, useQuiltTheme } from '@quilt/ui';
import { useAppStore } from '../state/app-store';
import { useAction } from '../features/finance/hooks';

export default function HomeScreen() {
  const { colors } = useQuiltTheme();
  const action = useAction();
  const householdId = useAppStore((s) => s.activeHouseholdId);
  const status = useAppStore((s) => s.householdsStatus);
  const error = useAppStore((s) => s.householdsError);
  const load = useAppStore((s) => s.loadHouseholds);
  const signOut = useAppStore((s) => s.signOut);
  const pending = useAppStore((s) => s.authPending);
  if (status === 'ready' && householdId) {
    return (
      <Redirect
        href={{
          pathname: '/workspace/[workspaceId]/[screen]',
          params: { workspaceId: householdId, screen: 'overview' },
        }}
      />
    );
  }
  return (
    <View className="flex-1 items-center justify-center bg-background p-6 gap-4">
      {error ? (
        <>
          <Text role="alert" tone="danger">
            {error}
          </Text>
          <Button
            label="Try again"
            onPress={() => {
              void load();
            }}
          />
          {Boolean(action.error) && (
            <Text role="alert" tone="danger">
              {action.error}
            </Text>
          )}
          <Button
            label="Sign out"
            variant="secondary"
            loading={pending}
            onPress={() => {
              void action.run(signOut);
            }}
          />
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.primary} />
          <Text tone="textMuted">Opening your household…</Text>
        </>
      )}
    </View>
  );
}
