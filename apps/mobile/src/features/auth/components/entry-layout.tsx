import type { PropsWithChildren } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, useQuiltTheme } from '@quilt/ui';
import appIcon from '../../../../assets/favicon.png';

export interface EntryLayoutProps extends PropsWithChildren {
  showBackButton?: boolean;
}

export function EntryLayout({ children, showBackButton }: EntryLayoutProps) {
  const { colors } = useQuiltTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

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
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: Math.max(insets.bottom, 12),
        }}
      >
        <View className="flex-row items-center justify-between px-4 md:px-8 py-2">
          <View
            style={{
              width: 40,
              height: 40,
              justifyContent: 'center',
              alignItems: 'flex-start',
            }}
          >
            {showBackButton ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={handleBack}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 20,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Feather name="arrow-left" size={22} color={colors.text} />
              </Pressable>
            ) : null}
          </View>

          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Link href="/" asChild aria-label="Quilt home">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Quilt home"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  columnGap: 8,
                }}
              >
                <Image
                  source={appIcon}
                  style={{ width: 32, height: 32 }}
                  resizeMode="contain"
                  accessible={false}
                  accessibilityIgnoresInvertColors
                />
                <Text variant="title" className="text-[23px] tracking-[-0.8px]">
                  Quilt
                </Text>
              </Pressable>
            </Link>
          </View>

          <View style={{ width: 40, height: 40 }} />
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
