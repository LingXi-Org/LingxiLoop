import type { CaseArticle, CaseInput, casesApi } from './api'

export type CaseSubmissionOutcome =
  | { status: 'saved' | 'published'; article: CaseArticle }
  | { status: 'save-failed'; error: unknown }
  | { status: 'publish-failed'; article: CaseArticle; error: unknown }
  | { status: 'obsolete' }

export async function submitCase(
  input: CaseInput,
  article: CaseArticle | undefined,
  publish: boolean,
  api: Pick<typeof casesApi, 'save' | 'action'>,
  current: () => boolean,
  onSaved: (article: CaseArticle) => void,
): Promise<CaseSubmissionOutcome> {
  let saved: CaseArticle
  try {
    saved = await api.save(input, article)
  } catch (error) {
    return current() ? { status: 'save-failed', error } : { status: 'obsolete' }
  }
  if (!current()) return { status: 'obsolete' }
  onSaved(saved)
  if (!publish) return { status: 'saved', article: saved }
  try {
    const published = await api.action(saved, 'publish')
    return current() ? { status: 'published', article: published } : { status: 'obsolete' }
  } catch (error) {
    return current() ? { status: 'publish-failed', article: saved, error } : { status: 'obsolete' }
  }
}
