import { useTheme as useNextTheme } from 'next-themes'

export type Theme = 'light' | 'dark'

export interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export function useTheme(): ThemeState {
  const { resolvedTheme, theme: configuredTheme, setTheme } = useNextTheme()
  const theme: Theme = (resolvedTheme ?? configuredTheme) === 'light' ? 'light' : 'dark'

  return {
    theme,
    setTheme: (nextTheme) => setTheme(nextTheme),
    toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
  }
}
