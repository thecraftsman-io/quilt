import { useCallback } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FinanceProvider } from '../../../features/finance/finance-context';
import { useAppStore } from '../../../state/app-store';
export default function WorkspaceLayout() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const userId = useAppStore((s) => s.session?.user.id);
  const activeId = useAppStore((s) => s.activeHouseholdId);
  const ready = useAppStore((s) => s.householdsStatus === 'ready');
  const select = useAppStore((s) => s.selectHousehold);
  useFocusEffect(
    useCallback(() => {
      if (ready && activeId !== workspaceId) {
        // Direct links should also remember the household being opened. A failed
        // preference update must not prevent access to an otherwise valid link.
        void select(workspaceId).catch(() => {});
      }
    }, [ready, activeId, workspaceId, select]),
  );
  return (
    <FinanceProvider key={`${userId}:${workspaceId}`} workspaceId={workspaceId}>
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </FinanceProvider>
  );
}
