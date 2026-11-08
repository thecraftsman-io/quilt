import { createContext, useContext, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import { TamaguiProvider, Theme } from 'tamagui';
import { tamaguiConfig } from './tamagui.config';
import { themes, type ThemeMode, type ThemePreference } from './tokens';

const ThemeContext = createContext<ThemeMode | null>(null);

export function QuiltProvider({
  children,
  theme = 'system',
}: PropsWithChildren<{ theme?: ThemePreference }>) {
  const systemTheme = useColorScheme();
  const mode = theme === 'system' ? (systemTheme ?? 'light') : theme;
  return (
    <ThemeContext.Provider value={mode}>
      <TamaguiProvider config={tamaguiConfig} defaultTheme={mode} key={mode}>
        <Theme name={mode}>{children}</Theme>
      </TamaguiProvider>
    </ThemeContext.Provider>
  );
}

export function useQuiltTheme() {
  const mode = useContext(ThemeContext);
  if (!mode) {
    throw new Error(
      'Wrap your application in QuiltProvider before using @quilt/ui.',
    );
  }
  return { mode, colors: themes[mode] };
}
