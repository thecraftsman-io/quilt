import { Redirect, useLocalSearchParams } from 'expo-router';
export default function WorkspaceIndex() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  return (
    <Redirect
      href={{
        pathname: '/workspace/[workspaceId]/[screen]',
        params: { workspaceId, screen: 'overview' },
      }}
    />
  );
}
