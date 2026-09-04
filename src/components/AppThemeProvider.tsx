import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute={['class', 'data-theme']}
      defaultTheme="dark"
      enableSystem={false}
      storageKey="lingxiloop-theme"
    >
      {children}
    </ThemeProvider>
  )
}
