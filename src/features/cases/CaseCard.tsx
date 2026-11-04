import type { MouseEvent, ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { markdownText } from '@/features/content-editor/document'
import type { CaseArticle } from './api'
import { CaseCover } from './CaseCover'
import { caseDate } from './presentation'

export function CaseCard({ article, href, onNavigate, scopeKey, featured = false, actions, onRefresh, onRetry, busy }: {
  article: CaseArticle
  href: string
  onNavigate(): void
  scopeKey: string
  featured?: boolean
  actions?: ReactNode
  onRefresh?(): void
  onRetry?(): Promise<void>
  busy?: boolean
}) {
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onNavigate()
  }
  return <article className={featured ? 'case-featured' : 'case-card'}>
    <div className="case-card-cover">
      <CaseCover cover={article.generatedCover} fallbackUrl={article.cover} title={article.title} scopeKey={`${scopeKey}:${article.id}`}
        className="h-full [&>div:first-child]:h-full [&>div:first-child]:aspect-auto" onRefresh={onRefresh} onRetry={onRetry} busy={busy}
        coverLink={<a href={href} onClick={open} className="case-cover-link" tabIndex={-1} aria-label={article.title} />} />
    </div>
    <div className="case-card-copy">
      <h2><a className="case-card-link" href={href} onClick={open}>{article.title}</a></h2>
      <p>{markdownText(article.summary)}</p>
      <div className="case-card-meta">
        {featured && <Avatar><AvatarImage src={article.authorAvatarUrl ?? undefined} alt="" /><AvatarFallback>{article.authorName.slice(0, 1)}</AvatarFallback></Avatar>}
        <span>{article.authorName}</span><span aria-hidden="true">·</span>
        <time dateTime={article.publishedAt ?? article.createdAt}>{caseDate(article, true)}</time>
        {article.view === 'manage' && article.status !== 'published' && <span>{article.status === 'draft' ? '草稿' : '已下架'}</span>}
      </div>
    </div>
    {actions && <div className="case-card-actions">{actions}</div>}
  </article>
}
