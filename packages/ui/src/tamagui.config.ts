import { defaultConfig } from '@tamagui/config/v6';
import { createFont, createTamagui, createTokens, isWeb } from 'tamagui';
import { layout, radii, spacing, themes } from './tokens';

const systemFont = createFont({
  family: isWeb
    ? '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    : 'System',
  size: {
    xs: 13,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 44,
  },
  lineHeight: {
    xs: 20,
    sm: 20,
    base: 24,
    lg: 26,
    xl: 28,
    '2xl': 32,
    '3xl': 38,
    '4xl': 44,
    '5xl': 52,
  },
  weight: { normal: '400', medium: '500', semibold: '600', bold: '700' },
});

function quiltTheme(mode: 'light' | 'dark') {
  const colors = themes[mode];
  return {
    ...defaultConfig.themes[mode],
    ...colors,
    color: colors.text,
    colorHover: colors.text,
    colorPress: colors.text,
    colorFocus: colors.text,
    backgroundHover: colors.surfaceMuted,
    backgroundPress: colors.surfaceMuted,
    backgroundFocus: colors.surface,
    borderColor: colors.controlBorder,
    borderColorHover: colors.primary,
    borderColorPress: colors.primaryPressed,
    borderColorFocus: colors.primary,
    placeholderColor: colors.textMuted,
  };
}

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  tokens: createTokens({
    ...defaultConfig.tokens,
    // Semantic colors live in themes so utility classes stay theme-reactive.
    color: defaultConfig.tokens.color,
    space: {
      ...defaultConfig.tokens.space,
      ...spacing,
      0: 0,
      1: 4,
      2: 8,
      3: 12,
      4: 16,
      5: 20,
      6: 24,
      8: 32,
      12: 48,
    },
    radius: { ...defaultConfig.tokens.radius, ...radii },
  }),
  themes: { light: quiltTheme('light'), dark: quiltTheme('dark') },
  fonts: { ...defaultConfig.fonts, body: systemFont, heading: systemFont },
  media: {
    ...defaultConfig.media,
    phone: { minWidth: 375 },
    short: { maxHeight: 739 },
    sm: { minWidth: 640 },
    md: { minWidth: layout.wideBreakpoint },
    lg: { minWidth: 1024 },
    xl: { minWidth: 1280 },
  },
  settings: {
    ...defaultConfig.settings,
    defaultFont: 'body',
    onlyAllowShorthands: false,
  },
});

type QuiltConfig = typeof tamaguiConfig;
declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Tamagui reads this interface augmentation for token inference.
  interface TamaguiCustomConfig extends QuiltConfig {}
}

export default tamaguiConfig;
