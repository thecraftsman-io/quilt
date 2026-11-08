import {
  useCallback,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

export function useReducedMotion() {
  // Keep motion off until the device preference is known.
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    const update = (enabled: boolean) => {
      if (active) setReduced(enabled);
    };
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      update,
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(update)
      .catch(() => {});
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

/** Animate content on entry and back navigation while keeping app controls still. */
export function ScreenTransition({ children }: PropsWithChildren) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(1));
  useFocusEffect(
    useCallback(() => {
      if (reduced) {
        progress.setValue(1);
        return;
      }
      progress.setValue(0);
      const animation = Animated.timing(progress, {
        toValue: 1,
        duration: 180,
        easing: Easing.out((value) => Easing.cubic(value)),
        useNativeDriver: Platform.OS !== 'web',
      });
      animation.start();
      return () => animation.stop();
    }, [progress, reduced]),
  );
  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [6, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
