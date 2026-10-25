import type { ViewKey } from '@/types'

export interface WebDestination {
  projectId: string | null
  view: ViewKey['view']
  conversationId: string | null
}

const views: ViewKey['view'][] = ['conversations', 'agents', 'cases', 'forum', 'course-materials', 'learning', 'courses', 'course-members', 'course-status']
let navigationEpoch = 0

export const beginWebNavigation = () => ++navigationEpoch
export const currentWebNavigation = () => navigationEpoch
export const isCurrentWebNavigation = (epoch: number) => epoch === navigationEpoch

export function readWebDestination(): WebDestination & { explicit: boolean; invalidView: boolean } {
  const parameters = new URLSearchParams(window.location.search)
  const requestedView = /^\/cases(?:\/|$)/.test(window.location.pathname) ? 'cases' : parameters.get('view')
  // Retired library URLs resolve to the sole course materials implementation.
  const canonicalView = requestedView === 'library' ? 'course-materials' : requestedView
  const view = views.find((candidate) => candidate === canonicalView) ?? 'conversations'
  const invalidView = canonicalView !== null && canonicalView !== view
  return {
    projectId: parameters.get('project') || null,
    view,
    conversationId: !invalidView && view === 'conversations' ? parameters.get('conversation') || null : null,
    explicit: requestedView === 'cases' || ['project', 'view', 'conversation'].some((key) => parameters.has(key)),
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
  if (destination.view === 'forum' && current.searchParams.get('project') === destination.projectId && current.searchParams.has('post')) {parameters.set('post',current.searchParams.get('post')!);if(current.searchParams.has('type'))parameters.set('type',current.searchParams.get('type')!)}
  const caseId = /^\/cases\/([^/]+)$/.exec(current.pathname)?.[1] ?? (current.searchParams.has('case') ? encodeURIComponent(current.searchParams.get('case')!) : null)
  if (destination.view === 'cases' && current.searchParams.has('company')) parameters.set('company', current.searchParams.get('company')!)
  const path = destination.view === 'cases' ? `/cases${caseId ? `/${caseId}` : ''}?${parameters}` : `/?${parameters}`
  if (`${current.pathname}${current.search}${current.hash}` === path) return
  const state=destination.view==='forum' && current.searchParams.get('view')==='forum' && current.searchParams.get('project')===destination.projectId ? window.history.state : null
  window.history[mode === 'push' ? 'pushState' : 'replaceState'](state, '', path)
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
  if(destination.view === 'forum' && parameters.has('post')) {next.set('post',parameters.get('post')!);if(parameters.has('type'))next.set('type',parameters.get('type')!)}
  if (destination.view === 'cases' && parameters.has('company')) next.set('company', parameters.get('company')!)
  if (destination.view === 'cases') return `${window.location.pathname.startsWith('/cases') ? window.location.pathname : '/cases'}?${next}`
  return `/?${next}`
}
