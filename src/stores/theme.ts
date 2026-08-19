import { create } from 'zustand'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'lingxiloop-theme'

function preferredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return 'dark'
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

const initialTheme = preferredTheme()
applyTheme(initialTheme)

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  setTheme(theme) {
    window.localStorage.setItem(STORAGE_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },
  toggleTheme() {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
  },
}))
