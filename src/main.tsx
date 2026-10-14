import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/geist'
import 'katex/dist/katex.min.css'
import { AppThemeProvider } from './components/AppThemeProvider'
import { isElectron } from './lib/runtime'
import './styles/globals.css'

const root = createRoot(document.getElementById('root')!)

async function boot() {
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
