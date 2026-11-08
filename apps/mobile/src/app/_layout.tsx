import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, Platform } from 'react-native';
import { Text, View, useQuiltTheme } from '@quilt/ui';
import { AppearanceProvider } from '../state/appearance';
import {
  appStore,
  subscribeToSessionChanges,
  useAppStore,
} from '../state/app-store';

function RootNavigator() {
  const { colors, mode } = useQuiltTheme();
  const session = useAppStore((state) => state.session);
  const status = useAppStore((state) => state.sessionStatus);
  useEffect(() => {
    const refresh = () => {
      void appStore.getState().refreshSession();
    };
    refresh();
    const unsubscribe = subscribeToSessionChanges();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    if (Platform.OS === 'web') window.addEventListener('focus', refresh);
    return () => {
      unsubscribe();
      subscription.remove();
      if (Platform.OS === 'web') window.removeEventListener('focus', refresh);
    };
  }, []);
  if (status === 'idle' || status === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-background gap-4">
        <ActivityIndicator color={colors.primary} />
        <Text tone="textMuted">Opening Quilt…</Text>
      </View>
    );
  }
  const authenticated =
    Boolean(session?.user.emailVerified) && status === 'ready';
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Protected guard={!authenticated}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={authenticated}>
          <Stack.Screen name="home" />
          <Stack.Screen name="workspace" />
        </Stack.Protected>
        <Stack.Screen name="verify-email" />
      </Stack>
    </>
  );
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppearanceProvider>
        <RootNavigator />
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}
