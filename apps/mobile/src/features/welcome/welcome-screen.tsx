import { Link, useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Button, Text, View, useQuiltTheme } from '@quilt/ui';
import { EntryLayout } from '../auth/components/entry-layout';

const illustrationSizes = {
  mobile: {
    frame: 'w-[186px] h-[168px] short:w-[148.8px] short:h-[134.4px]',
    canvas: 'scale-[0.6] short:scale-[0.48]',
  },
  desktop: { frame: 'w-[310px] h-[280px]', canvas: 'scale-100' },
};

function SharedPlan({
  size = 'mobile',
}: {
  size?: keyof typeof illustrationSizes;
}) {
  const { colors } = useQuiltTheme();
  const classes = illustrationSizes[size];
  return (
    <View aria-hidden className={`relative self-center ${classes.frame}`}>
      <View className="absolute inset-0 items-center justify-center">
        <View
          className={`relative shrink-0 w-[310px] h-[280px] ${classes.canvas}`}
        >
          <View className="absolute w-[226px] h-[226px] top-[26px] left-[44px] bg-surfaceMuted rounded-[60px] rotate-[-12deg]" />
          <View className="absolute left-3 top-[30px] w-[224px] p-[22px] gap-[14px] bg-surface border border-border rounded-[20px] rotate-[-6deg] shadow-[0_12px_32px_rgba(12,24,16,0.07)]">
            <View className="flex-row items-center gap-3">
              <Feather name="home" size={18} color={colors.primary} />
              <Text variant="label">The everyday, covered.</Text>
            </View>
            <View className="gap-3 border-t border-border pt-3">
              <Text variant="caption" tone="textMuted">
                Rent & bills
              </Text>
              <Text variant="caption" tone="textMuted">
                The weekly shop
              </Text>
            </View>
          </View>
          <View className="absolute right-0 bottom-[18px] w-[210px] p-[22px] gap-4 bg-primary rounded-[20px] rotate-[7deg] shadow-[0_12px_28px_rgba(12,24,16,0.12)]">
            <Feather name="sunrise" size={26} color={colors.onPrimary} />
            <Text variant="title" className="text-onPrimary">
              Room for{`\n`}the next chapter.
            </Text>
            <View className="h-[3px] w-[56px] rounded-[2px] bg-onPrimary opacity-50" />
          </View>
        </View>
      </View>
    </View>
  );
}

export function WelcomeScreen() {
  const { colors } = useQuiltTheme();
  const router = useRouter();
  return (
    <EntryLayout>
      <View className="grow shrink-0 w-full max-w-[1120px] self-center justify-center px-6 pt-4 pb-6 gap-6 short:pt-2 short:pb-4 short:gap-4 lg:px-12 lg:py-8 lg:gap-10">
        <View className="flex-col items-stretch gap-5 lg:flex-row lg:items-center lg:gap-12">
          <View className="lg:hidden">
            <SharedPlan />
          </View>
          <View className="gap-5 flex items-center lg:flex-[1.25] lg:gap-6 lg:items-stretch">
            <View className="gap-3">
              <Text
                variant="display"
                className="text-[30px] leading-[36px] tracking-[-1.4px] phone:text-[34px] phone:leading-[40px] lg:text-[56px] lg:leading-[62px] lg:tracking-[-2.2px]"
              >
                Less “who paid?”{`\n`}More “what’s next?”
              </Text>
              <Text
                tone="textMuted"
                className="max-w-[440px] text-base leading-[24px] lg:text-[17px] lg:leading-[27px]"
              >
                A home for the money you share. Keep household spending,
                budgets, and savings goals in one clear picture.
              </Text>
            </View>
            <View className="w-full max-w-[240px] gap-2">
              <Button
                label="Create an account"
                onPress={() => router.push('/sign-up')}
              />
              <Link href="/sign-in" asChild>
                <Text
                  variant="label"
                  tone="textMuted"
                  className="self-center py-3"
                >
                  Already a member?{' '}
                  <Text variant="label" className="text-primary">
                    Sign in →
                  </Text>
                </Text>
              </Link>
            </View>
          </View>
          <View className="hidden lg:flex flex-1">
            <SharedPlan size="desktop" />
          </View>
        </View>
        <View className="flex-row flex-wrap justify-between gap-5 border-t border-border pt-6">
          {(
            [
              ['credit-card', 'Track shared spending'],
              ['pie-chart', 'Plan the month'],
              ['flag', 'Save for what’s next'],
            ] as const
          ).map(([icon, label]) => (
            <View key={icon} className="flex-row items-center gap-2">
              <Feather
                name={icon}
                size={16}
                color={colors.primary}
                accessible={false}
              />
              <Text variant="caption" tone="textMuted">
                {label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </EntryLayout>
  );
}
