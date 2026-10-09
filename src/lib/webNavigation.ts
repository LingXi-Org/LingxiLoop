import type { ViewKey } from '@/types'

export interface WebDestination {
  projectId: string | null
  view: ViewKey['view']
  conversationId: string | null
}

const views: ViewKey['view'][] = ['conversations', 'agents', 'mail', 'calendar', 'library', 'learning', 'courses', 'course-content', 'course-members', 'course-status']
let navigationEpoch = 0

export const beginWebNavigation = () => ++navigationEpoch
export const currentWebNavigation = () => navigationEpoch
export const isCurrentWebNavigation = (epoch: number) => epoch === navigationEpoch

export function readWebDestination(): WebDestination & { explicit: boolean; invalidView: boolean } {
  const parameters = new URLSearchParams(window.location.search)
  const requestedView = parameters.get('view')
  const view = views.find((candidate) => candidate === requestedView) ?? 'conversations'
  const invalidView = requestedView !== null && requestedView !== view
  return {
    projectId: parameters.get('project') || null,
    view,
    conversationId: !invalidView && view === 'conversations' ? parameters.get('conversation') || null : null,
    explicit: ['project', 'view', 'conversation'].some((key) => parameters.has(key)),
    invalidView,
  }
}

export function writeWebDestination(destination: WebDestination, mode: 'push' | 'replace'): void {
  if (typeof window === 'undefined') return
  // Invitation acceptance and password recovery have independent URL contracts.
  const current = new URL(window.location.href)
  if (current.pathname.startsWith('/invite') || current.searchParams.has('invite') || current.searchParams.get('mode') === 'reset' || current.hash.includes('invite=')) return
  const parameters = new URLSearchParams()
  if (destination.projectId) parameters.set('project', destination.projectId)
  parameters.set('view', destination.view)
  if (destination.view === 'conversations' && destination.conversationId) parameters.set('conversation', destination.conversationId)
  const path = `/?${parameters}`
  if (`${current.pathname}${current.search}${current.hash}` === path) return
  window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', path)
}

export function safeAuthReturnPath(parameters: URLSearchParams): string {
  const requested = parameters.get('returnTo')
  if (requested) {
    if (!requested.startsWith('/') || requested.startsWith('//') || /[\\\r\n]/.test(requested)) return '/'
    const target = new URL(requested, window.location.origin)
    return target.origin === window.location.origin ? `${target.pathname}${target.search}${target.hash}` : '/'
  }
  if (parameters.has('invite') || parameters.get('mode') === 'reset') return '/'
  const destination = readWebDestination()
  if (!destination.explicit) return '/'
  const next = new URLSearchParams()
  if (destination.projectId) next.set('project', destination.projectId)
  next.set('view', destination.view)
  if (destination.conversationId) next.set('conversation', destination.conversationId)
  return `/?${next}`
}
