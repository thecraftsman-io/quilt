import { useRef, useState, type ComponentRef } from 'react';
import {
  ScrollView,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Button, Pressable, Text, View, useQuiltTheme } from '@quilt/ui';
import { EntryLayout } from '../auth/components/entry-layout';

const slides = [
  {
    icon: 'credit-card' as const,
    title: 'Shared spending,\nmade simple.',
    subtitle:
      'Split household bills, keep track of daily expenses, and see who paid what at a glance.',
  },
  {
    icon: 'pie-chart' as const,
    title: 'Plan the month\ntogether.',
    subtitle:
      'Set realistic monthly budgets for groceries, rent, and utilities so everyone stays aligned.',
  },
  {
    icon: 'target' as const,
    title: 'Room for what’s\nnext in life.',
    subtitle:
      'Pool joint savings toward shared goals, from dream vacations to your next home.',
  },
];

export function WelcomeScreen() {
  const { colors } = useQuiltTheme();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(
    Math.min(windowWidth - 48, 432),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const nextWidth = e.nativeEvent.layout.width;
    if (nextWidth > 0 && Math.abs(nextWidth - containerWidth) > 1) {
      setContainerWidth(nextWidth);
    }
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (containerWidth > 0) {
      const index = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
      if (index >= 0 && index < slides.length) {
        setActiveIndex(index);
      }
    }
  };

  const goToSlide = (index: number) => {
    setActiveIndex(index);
    scrollRef.current?.scrollTo({
      x: index * containerWidth,
      animated: true,
    });
  };

  return (
    <EntryLayout>
      <View className="flex-1 w-full max-w-[480px] self-center justify-between px-6 pt-4 pb-8 gap-8">
        <View className="flex-1 justify-center" onLayout={onLayout}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumScrollEnd}
            scrollEventThrottle={16}
            style={{ width: '100%' }}
          >
            {slides.map((slide, i) => (
              <View
                key={i}
                style={{ width: containerWidth }}
                className="px-4 items-center justify-center gap-6"
              >
                <View className="w-20 h-20 rounded-3xl bg-surfaceMuted items-center justify-center border border-border shadow-[0_4px_12px_rgba(12,24,16,0.04)]">
                  <Feather
                    name={slide.icon}
                    size={36}
                    color={colors.primary}
                    accessible={false}
                  />
                </View>
                <View className="gap-3 items-center">
                  <Text
                    variant="display"
                    className="text-center text-[30px] leading-[36px] tracking-[-1.2px]"
                  >
                    {slide.title}
                  </Text>
                  <Text
                    tone="textMuted"
                    className="text-center text-base leading-[24px] max-w-[340px]"
                  >
                    {slide.subtitle}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Dots Indicator */}
          <View className="flex-row items-center justify-center gap-2 pt-6">
            {slides.map((_, i) => (
              <Pressable
                key={i}
                aria-label={`Slide ${i + 1}`}
                onPress={() => goToSlide(i)}
                className={`h-2 rounded-full transition-all ${
                  i === activeIndex ? 'w-6 bg-primary' : 'w-2 bg-border'
                }`}
              />
            ))}
          </View>
        </View>

        {/* Action Controls */}
        <View className="w-full gap-3">
          <Button
            label="Create an account"
            onPress={() => router.push('/sign-up')}
            className="w-full"
          />
          <Link href="/sign-in" asChild>
            <Text variant="label" tone="textMuted" className="py-2 text-center">
              Already a member?{' '}
              <Text variant="label" className="text-primary">
                Sign in →
              </Text>
            </Text>
          </Link>
        </View>
      </View>
    </EntryLayout>
  );
}
