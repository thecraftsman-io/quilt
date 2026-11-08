import { html } from '@tamagui/tailwind';
import { getActionProps, type ActionProps } from './action-props';

/** An unstyled action with the same utility-class support as View and Text. */
export function Pressable({ className = '', ...props }: ActionProps) {
  return (
    <html.button
      {...getActionProps(props)}
      type="button"
      className={`flex flex-col border-0 bg-transparent p-0 ${className}`}
    />
  );
}
