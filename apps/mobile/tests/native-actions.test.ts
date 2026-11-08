import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../../../packages/ui/src/button';
import { IconButton } from '../../../packages/ui/src/icon-button';
import { Pressable } from '../../../packages/ui/src/pressable';

// Isolate styling, but exercise the actual shared controls and Tamagui's
// installed Android host adapter, rather than substituting a web click.
vi.mock('@tamagui/tailwind', () => ({
  html: { button: 'DOMButton' },
  View: 'DOMView',
  Text: 'DOMText',
  styled: () => 'StyledDOMButton',
}));
vi.mock('tamagui', () => ({ Spinner: 'Spinner' }));
const { platform } = vi.hoisted(() => ({ platform: { OS: 'android' } }));
vi.mock('react-native', () => ({ Platform: platform }));

const uiRequire = createRequire(
  new URL('../../../packages/ui/package.json', import.meta.url),
);
const coreRequire = createRequire(
  createRequire(uiRequire.resolve('@tamagui/tailwind')).resolve(
    '@tamagui/core/internal-runtime',
  ),
);
const nativeDir = resolve(
  dirname(coreRequire.resolve('@tamagui/web/internal-runtime')),
  '../esm/dom',
);
const nativeSource = readFileSync(
  resolve(nativeDir, 'primitives.native.js'),
  'utf8',
);
const start = nativeSource.indexOf('function renderDOMView(');
const end = nativeSource.indexOf('function DOMText(', start);
const adapters = readFileSync(resolve(nativeDir, 'adapters.native.js'), 'utf8');

type NativeHost = {
  type: string;
  props: { onPress?: (event: unknown) => void; disabled?: boolean };
};
const renderNativeHost = runInNewContext(
  `${adapters.slice(0, adapters.indexOf('export {'))}\n(${nativeSource.slice(start, end)})`,
  {
    jsx: (type: string, props: NativeHost['props']) => ({ type, props }),
    View: 'NativeView',
    Pressable: 'NativePressable',
  },
) as (props: Record<string, unknown>) => NativeHost;

// Include the real native HTML prop resolver so unsupported accessibility
// attributes cannot pass the web smoke checks and then crash on a phone.
const htmlRuntime = readFileSync(
  resolve(nativeDir, 'htmlRuntime.native.js'),
  'utf8',
);
const htmlTags = readFileSync(resolve(nativeDir, 'html.native.js'), 'utf8');
const tablesStart = htmlTags.indexOf('var domTag =');
const tablesEnd = htmlTags.indexOf('var domValidStyles', tablesStart);
const nativeTag = runInNewContext(
  `${htmlRuntime.replace(/^import .*;$/gm, '').split('export {')[0]}
${htmlTags.slice(tablesStart, tablesEnd)}
domTag('button', 'NativeButtonFrame', { role: 'button' })`,
  {
    jsx: (type: string, props: Record<string, unknown>) => ({ type, props }),
    DOMText: 'NativeText',
    componentDisplayName: Symbol('displayName'),
  },
) as (props: Record<string, unknown>) => { props: Record<string, unknown> };

describe('Android actions', () => {
  it.each([
    [
      'Button',
      (onPress: () => void) => Button({ label: 'Create account', onPress }),
    ],
    [
      'IconButton',
      (onPress: () => void) =>
        IconButton({ 'aria-label': 'Switch theme', onPress }),
    ],
    [
      'Pressable',
      (onPress: () => void) => Pressable({ 'aria-label': 'Accounts', onPress }),
    ],
  ] as const)(
    '%s creates a native touch target and dispatches a tap once',
    (_name, render) => {
      const onPress = vi.fn();
      const element = render(onPress);
      expect(isValidElement<Record<string, unknown>>(element)).toBe(true);
      if (!isValidElement<Record<string, unknown>>(element))
        throw new Error('Missing control');
      const host = renderNativeHost(nativeTag(element.props).props);
      expect(host.type).toBe('NativePressable');
      expect(host.props.onPress).toBeTypeOf('function');
      host.props.onPress?.({ nativeEvent: { pageX: 12, pageY: 24 } });
      expect(onPress).toHaveBeenCalledOnce();
    },
  );
  it.each([
    [
      'password toggle',
      () => IconButton({ onPress: () => {}, 'aria-pressed': true }),
    ],
    [
      'selected navigation',
      () => Pressable({ onPress: () => {}, 'aria-current': 'page' }),
    ],
  ] as const)(
    '%s exposes its selected state using supported native props',
    (_name, render) => {
      const element = render();
      if (!isValidElement<Record<string, unknown>>(element))
        throw new Error('Missing control');
      const resolved = nativeTag(element.props).props;
      expect(resolved.accessibilityState).toMatchObject({ selected: true });
    },
  );
  it.each([
    [
      'disabled button',
      (onPress: () => void) =>
        Button({ label: 'Save', disabled: true, onPress }),
    ],
    [
      'loading button',
      (onPress: () => void) =>
        Button({ label: 'Save', loading: true, onPress }),
    ],
    [
      'disabled icon',
      (onPress: () => void) => IconButton({ disabled: true, onPress }),
    ],
    [
      'disabled action',
      (onPress: () => void) => Pressable({ disabled: true, onPress }),
    ],
  ] as const)('%s cannot dispatch a native tap', (_name, render) => {
    const onPress = vi.fn();
    const element = render(onPress);
    if (!isValidElement<Record<string, unknown>>(element))
      throw new Error('Missing control');
    const resolved = nativeTag(element.props).props;
    expect(resolved.accessibilityState).toMatchObject({ disabled: true });
    expect(renderNativeHost(resolved).props.onPress).toBeUndefined();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('keeps web click handlers and accessibility attributes intact', () => {
    platform.OS = 'web';
    try {
      const onPress = vi.fn();
      const onClick = vi.fn();
      const element = Pressable({
        onPress,
        onClick,
        'aria-pressed': true,
        'aria-current': 'page',
      });
      if (
        !isValidElement<{
          onClick?: (event: unknown) => void;
          onPress?: () => void;
          'aria-pressed'?: boolean;
          'aria-current'?: string;
        }>(element)
      )
        throw new Error('Missing control');
      expect(element.props.onClick).toBe(onClick);
      expect(element.props.onPress).toBeUndefined();
      expect(element.props['aria-pressed']).toBe(true);
      expect(element.props['aria-current']).toBe('page');
      if (typeof element.props.onClick !== 'function')
        throw new Error('Missing click handler');
      element.props.onClick({ type: 'click' });
      expect(onClick).toHaveBeenCalledOnce();
      expect(onPress).not.toHaveBeenCalled();
    } finally {
      platform.OS = 'android';
    }
  });
});
