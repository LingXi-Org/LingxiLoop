import { StrictMode, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { isElectron, isNotificationWindow } from './lib/runtime'
import './styles/globals.css'

const root = createRoot(document.getElementById('root')!)

function render(Component: ComponentType) {
  root.render(<StrictMode><Component /></StrictMode>)
}

async function boot() {
  if (isNotificationWindow) {
    const { NotificationWindow } = await import('./components/NotificationWindow')
    render(NotificationWindow)
    return
  }

  if (isElectron) document.body.classList.add('electron')
  const { App } = await import('./App')
  render(App)

  if (import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
    const start = () => { void import('./observability-entry').then(({ mountObservability }) => mountObservability()) }
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(start)
    else globalThis.setTimeout(start, 0)
  }
}

void boot()
