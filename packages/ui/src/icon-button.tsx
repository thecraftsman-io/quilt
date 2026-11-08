import { html } from '@tamagui/tailwind';
import { getActionProps, type ActionProps } from './action-props';

export function IconButton({ className = '', ...props }: ActionProps) {
  return (
    <html.button
      type="button"
      {...getActionProps(props)}
      className={`box-border border-0 flex flex-col items-center justify-center min-h-[48px] min-w-[48px] rounded-lg bg-surface hover:bg-surfaceMuted press:bg-surfaceMuted focus-visible:outline-2 focus-visible:outline-primary ${className}`}
    />
  );
}
