import type { ComponentProps } from 'react';
import { Platform } from 'react-native';
import type { html } from '@tamagui/tailwind';

export type ActionProps = Omit<
  ComponentProps<typeof html.button>,
  'onPress'
> & {
  /** A platform-independent action; native and browser event payloads differ. */
  onPress?: () => void;
};

/** Keep our onPress interface while using the HTML adapter's native touch path. */
export function getActionProps({
  onPress,
  onClick,
  'aria-pressed': pressed,
  'aria-current': current,
  'aria-selected': selected,
  ...props
}: ActionProps): ActionProps {
  return {
    ...props,
    // Native html.button becomes a React Native Pressable only with onClick.
    onClick: props.disabled
      ? undefined
      : (onClick ?? (onPress ? () => onPress() : undefined)),
    ...(Platform.OS === 'web'
      ? {
          'aria-pressed': pressed,
          'aria-current': current,
          'aria-selected': selected,
        }
      : {
          // The native HTML adapter rejects aria-pressed and aria-current.
          'aria-selected':
            selected ??
            (pressed !== undefined
              ? pressed === true || pressed === 'true'
              : current !== undefined
                ? current !== false && current !== 'false'
                : undefined),
        }),
  };
}
