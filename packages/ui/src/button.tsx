import { html, View, styled } from '@tamagui/tailwind';
import { Spinner } from 'tamagui';
import { Text } from './text';
import { getActionProps, type ActionProps } from './action-props';

const ButtonFrame = styled(
  html.button,
  'box-border max-w-full min-h-[48px] min-w-[48px] px-6 py-3 rounded-md border flex flex-row items-center justify-center gap-2 relative hover:translate-y-[-1px] press:translate-y-[1px] focus-visible:border-text disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none',
  {
    displayName: 'QuiltButton',
    variants: {
      variant: {
        primary:
          'bg-primary border-primaryPressed press:bg-primaryPressed shadow-[0_1px_1px_rgba(12,24,16,0.16),0_4px_8px_-3px_rgba(12,24,16,0.3)] press:shadow-[0_1px_2px_rgba(12,24,16,0.12)]',
        secondary:
          'bg-surface border-controlBorder press:bg-surfaceMuted shadow-[0_1px_2px_rgba(12,24,16,0.06),0_3px_6px_-3px_rgba(12,24,16,0.18)] press:shadow-[0_1px_2px_rgba(12,24,16,0.08)]',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);

export interface ButtonProps extends Omit<ActionProps, 'children'> {
  label: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled = false,
  'aria-label': ariaLabel,
  ...props
}: ButtonProps) {
  return (
    <ButtonFrame
      {...getActionProps({
        ...props,
        disabled: disabled || loading,
        'aria-label': ariaLabel ?? label,
        'aria-busy': loading,
      })}
      type="button"
      variant={variant}
    >
      <View
        aria-hidden
        className="pointer-events-none absolute top-0 left-2 right-2 h-[1px] bg-white/15"
      />
      {loading && (
        <Spinner
          size="small"
          color={variant === 'primary' ? 'onPrimary' : 'text'}
          aria-hidden
        />
      )}
      <Text
        variant="label"
        className={variant === 'primary' ? 'text-onPrimary' : 'text-text'}
      >
        {label}
      </Text>
    </ButtonFrame>
  );
}
