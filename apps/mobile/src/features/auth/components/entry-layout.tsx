import type { PropsWithChildren } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, useQuiltTheme } from '@quilt/ui';
import appIcon from '../../../../assets/favicon.png';

export function EntryLayout({ children }: PropsWithChildren) {
  const { colors } = useQuiltTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, width: '100%', backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={{
          flexGrow: 1,
          width: '100%',
          maxWidth: '100%',
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        <View className="flex-row items-center px-6 md:px-10 py-4">
          <Link href="/" aria-label="Quilt home">
            <View className="flex-row items-center gap-2">
              <Image
                source={appIcon}
                style={{ width: 32, height: 32, borderRadius: 9 }}
                accessible={false}
                accessibilityIgnoresInvertColors
              />
              <Text variant="title" className="text-[23px] tracking-[-0.8px]">
                Quilt
              </Text>
            </View>
          </Link>
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
