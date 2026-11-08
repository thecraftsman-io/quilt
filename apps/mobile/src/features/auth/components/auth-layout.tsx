import type { PropsWithChildren } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Text, View, useQuiltTheme } from '@quilt/ui';
import { EntryLayout } from './entry-layout';

function TogetherIllustration() {
  const { colors } = useQuiltTheme();
  return (
    <View aria-hidden className="relative w-[286px] h-[236px] self-center">
      <View className="absolute top-5 left-2 w-[176px] h-[176px] rounded-[36px] border border-primary opacity-[0.18] rotate-[-12deg]" />
      <View className="absolute top-12 left-[60px] w-[176px] h-[176px] rounded-[36px] bg-primary rotate-[8deg] shadow-[0_16px_30px_rgba(12,24,16,0.12)]">
        <View className="absolute left-9 top-9 w-[104px] h-[104px] border border-onPrimary opacity-[0.35] rounded-[24px]" />
        <View className="absolute left-[84px] top-9 w-px h-[104px] bg-onPrimary opacity-[0.35]" />
        <View className="absolute left-9 top-[84px] w-[104px] h-px bg-onPrimary opacity-[0.35]" />
      </View>
      <View className="absolute right-1 top-3 w-[58px] h-[58px] rounded-[20px] bg-surface items-center justify-center rotate-[8deg] shadow-[0_6px_18px_rgba(12,24,16,0.06)]">
        <Feather name="check" size={25} color={colors.primary} />
      </View>
    </View>
  );
}

export function AuthLayout({ children }: PropsWithChildren) {
  return (
    <EntryLayout>
      <View className="flex-1 w-full max-w-[1200px] self-center pb-12 gap-16 flex-col px-6 pt-8 lg:flex-row lg:px-10 lg:pt-6">
        <View className="flex-1 w-full justify-center items-center py-0 lg:py-10">
          <View className="w-full max-w-[400px]">{children}</View>
        </View>
        <View className="hidden lg:flex flex-1 rounded-[28px] p-12 bg-surfaceMuted justify-center min-h-[560px] gap-9">
          <TogetherIllustration />
          <View className="gap-4">
            <Text
              variant="display"
              className="text-[42px] leading-[48px] tracking-[-1.5px]"
            >
              Split the bills.{`\n`}Share the plan.
            </Text>
            <Text tone="textMuted" className="max-w-[310px]">
              From the weekly shop to a place of your own. Keep track of what
              you spend together and what you’re saving for.
            </Text>
          </View>
        </View>
      </View>
    </EntryLayout>
  );
}
