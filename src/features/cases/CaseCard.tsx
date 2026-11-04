import type { MouseEvent, ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { markdownText } from '@/features/content-editor/document'
import type { CaseArticle } from './api'
import { CaseCover } from './CaseCover'
import { caseDate } from './presentation'

export function CaseCard({ article, href, onNavigate, featured = false, actions }: {
  article: CaseArticle
  href: string
  onNavigate(): void
  featured?: boolean
  actions?: ReactNode
}) {
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onNavigate()
  }
  return <article className={featured ? 'case-featured' : 'case-card'}>
    <div className="case-card-cover">
      <CaseCover title={article.title} coverText={article.coverText} coverColor={article.coverColor}
        className="h-full"
        coverLink={<a href={href} onClick={open} className="case-cover-link" tabIndex={-1} aria-label={article.title} />} />
    </div>
    <a className="case-card-copy case-card-link" href={href} onClick={open} aria-label={article.title}>
      <h2>{article.title}</h2>
      <p>{markdownText(article.summary)}</p>
      <div className="case-card-meta">
        {featured && <Avatar><AvatarImage src={article.authorAvatarUrl ?? undefined} alt="" /><AvatarFallback>{article.authorName.slice(0, 1)}</AvatarFallback></Avatar>}
        <span>{article.authorName} <span aria-hidden="true">·</span> <time dateTime={article.publishedAt ?? article.createdAt}>{caseDate(article, true)}</time></span>
        {article.view === 'manage' && article.status !== 'published' && <span>{article.status === 'draft' ? '草稿' : '已下架'}</span>}
      </div>
    </a>
    {actions && <div className="case-card-actions">{actions}</div>}
  </article>
}
