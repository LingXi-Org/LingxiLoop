export type CaseView = 'reader' | 'manage'

export function caseViewFromSearch(search: string): CaseView {
  return new URLSearchParams(search).get('caseView') === 'manage' ? 'manage' : 'reader'
}

export function canManageCaseView(view: CaseView, canManage: boolean) {
  return view === 'manage' && canManage
}

export function caseArticleUrl(search: string, companyId: string | null | undefined, id: string | undefined, view: CaseView) {
  const query = new URLSearchParams(search)
  query.set('view', 'cases')
  if (companyId) query.set('company', companyId)
  if (view === 'manage') query.set('caseView', view)
  else query.delete('caseView')
  query.delete('case')
  query.delete('conversation')
  return `/cases${id ? `/${encodeURIComponent(id)}` : ''}?${query}`
}
