import { cn } from '@/lib/utils'
import { useTheme } from '@/stores/theme'

interface Props {
  className?: string
  showLabel?: boolean
  onToggle?: () => void
}

export function ThemeToggle({ className, showLabel = false, onToggle }: Props) {
  const theme = useTheme((s) => s.theme)
  const toggleTheme = useTheme((s) => s.toggleTheme)
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      aria-label={`切换到${next === 'light' ? '浅色' : '深色'}主题`}
      title={`切换到${next === 'light' ? '浅色' : '深色'}主题`}
      onClick={() => { toggleTheme(); onToggle?.() }}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[9px] text-ink-500 transition hover:bg-sky2-50 hover:text-skype-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky2-300',
        className,
      )}
    >
      <span className={showLabel ? 'app-menu-icon' : undefined}>{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</span>
      {showLabel && <span>{theme === 'dark' ? '浅色主题' : '深色主题'}</span>}
    </button>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-[18px] w-[18px]" aria-hidden>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
      <path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" />
    </svg>
  )
}
