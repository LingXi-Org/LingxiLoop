import { StrictMode, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { isCapacitorNative, isElectron, isNotificationWindow } from './lib/runtime'
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
  if (isCapacitorNative) {
    const platform = window.Capacitor?.getPlatform?.() || ''
    document.body.classList.add('native', `native-${platform}`)
    // Start native bridge setup in parallel with the product shell. Status-bar
    // and listener registration must never delay App import or first paint.
    void import('./lib/native').then(({ bootNative }) => bootNative())
  }

  const { App } = await import('./App')
  render(App)

  if (isCapacitorNative && import.meta.env.VITE_MOBILE_UPLOAD_SMOKE === '1') {
    void import('./dev/mobileUploadSmoke').then(({ installMobileUploadSmoke }) => {
      installMobileUploadSmoke()
    })
  }

  // Analytics is non-critical: load it after the product shell has painted.
  if (import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
    const start = () => { void import('./observability-entry').then(({ mountObservability }) => mountObservability()) }
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(start)
    else globalThis.setTimeout(start, 0)
  }
}

void boot()
