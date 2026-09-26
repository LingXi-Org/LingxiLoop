import { StrictMode, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/geist'
import { AppThemeProvider } from './components/AppThemeProvider'
import { isElectron, isNotificationWindow } from './lib/runtime'
import './styles/globals.css'

const root = createRoot(document.getElementById('root')!)

function render(Component: ComponentType) {
  root.render(<StrictMode><AppThemeProvider><Component /></AppThemeProvider></StrictMode>)
}

async function boot() {
  if (isNotificationWindow) {
    const { NotificationWindow } = await import('./components/NotificationWindow')
    render(NotificationWindow)
    return
  }

  if (isElectron) document.body.classList.add('electron')
  const [{ App }, { GlobalInteractionProvider }] = await Promise.all([
    import('./App'),
    import('./components/GlobalInteractionProvider'),
  ])
  root.render(
    <StrictMode>
      <AppThemeProvider>
        <GlobalInteractionProvider><App /></GlobalInteractionProvider>
      </AppThemeProvider>
    </StrictMode>,
  )

  if (import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
    const start = () => { void import('./observability-entry').then(({ mountObservability }) => mountObservability()) }
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(start)
    else globalThis.setTimeout(start, 0)
  }
}

void boot()
