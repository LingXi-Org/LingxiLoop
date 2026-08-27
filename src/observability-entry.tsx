import { createRoot } from 'react-dom/client'
import { ConditionalPostHogProvider } from './components/ConditionalPostHogProvider'
import { PostHogAppTracker } from './components/PostHogAppTracker'

export function mountObservability(): void {
  const host = document.createElement('div')
  host.hidden = true
  document.body.appendChild(host)
  createRoot(host).render(
    <ConditionalPostHogProvider>
      <PostHogAppTracker />
    </ConditionalPostHogProvider>,
  )
}
