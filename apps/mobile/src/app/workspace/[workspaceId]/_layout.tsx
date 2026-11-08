import { Stack, useLocalSearchParams } from 'expo-router';
import { FinanceProvider } from '../../../features/finance/finance-context';
import { useAppStore } from '../../../state/app-store';
export default function WorkspaceLayout() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const userId = useAppStore((s) => s.session?.user.id);
  return (
    <FinanceProvider key={`${userId}:${workspaceId}`} workspaceId={workspaceId}>
      <Stack screenOptions={{ headerShown: false }} />
    </FinanceProvider>
  );
}
