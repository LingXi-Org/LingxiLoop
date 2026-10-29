import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/geist'
import 'katex/dist/katex.min.css'
import { AppThemeProvider } from './components/AppThemeProvider'
import './styles/globals.css'

const root = createRoot(document.getElementById('root')!)

// A deploy replaces the hashed chunks; an open tab reloads onto the new build
// (at most once a minute, so a genuinely missing chunk cannot loop).
window.addEventListener('vite:preloadError', (event) => {
  const last = Number(sessionStorage.getItem('lingxiloop:chunk-reload') ?? 0)
  if (Date.now() - last < 60_000) return
  sessionStorage.setItem('lingxiloop:chunk-reload', String(Date.now()))
  event.preventDefault()
  window.location.reload()
})

async function boot() {
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
