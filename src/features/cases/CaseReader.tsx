import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { casesApi, type CaseArticle } from './api'
import { CaseCard } from './CaseCard'
import { CaseCover } from './CaseCover'
import { caseDate, caseOutline, relatedCases } from './presentation'

export function CaseReader({ article, children, scopeKey, articleUrl, onNavigate, notice }: {
  article: CaseArticle
  children: ReactNode
  scopeKey: string
  articleUrl(id: string): string
  onNavigate(id: string): void
  notice?: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const headings = useRef<HTMLElement[]>([])
  const clickedSection = useRef<{ id: string; scrollTop: number } | null>(null)
  const [outline, setOutline] = useState<ReturnType<typeof caseOutline>>([])
  const [active, setActive] = useState('')
  const [related, setRelated] = useState<CaseArticle[]>([])
  const [relatedError, setRelatedError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const abort = new AbortController()
    setRelated([]); setRelatedError(false)
    void casesApi.list('', '', 'reader', abort.signal).then(value => {
      if (!abort.signal.aborted && value.view === 'reader') setRelated(relatedCases(value.items, article))
    }).catch(() => { if (!abort.signal.aborted) setRelatedError(true) })
    return () => abort.abort()
  }, [article.id, article.companyId, article.category, scopeKey, retry])

  useEffect(() => {
    const container = body.current
    const scroll = root.current?.closest<HTMLElement>('[data-page-scroll]')
    if (!container || !scroll) return
    const updateActive = () => {
      // A short final section may not reach the top when scrolling is clamped.
      if (clickedSection.current?.scrollTop === scroll.scrollTop) {
        setActive(clickedSection.current.id)
        return
      }
      clickedSection.current = null
      const top = scroll.getBoundingClientRect().top + 32
      let selected = headings.current[0]?.id ?? ''
      for (const heading of headings.current) {
        if (heading.getBoundingClientRect().top > top) break
        selected = heading.id
      }
      if (scroll.scrollTop > 0 && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2) selected = headings.current.at(-1)?.id ?? selected
      setActive(selected)
    }
    const readHeadings = () => {
      clickedSection.current = null
      // Observe rendered headings so lazy rich-text readers and Markdown share anchors.
      const nodes = Array.from(container.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'))
      const entries = caseOutline(nodes.map(node => ({ title: node.textContent ?? '', level: Number(node.tagName.slice(1)) })))
      headings.current = entries.map(entry => {
        const node = nodes[entry.index]
        node.id = entry.id
        node.tabIndex = -1
        return node
      })
      setOutline(entries)
      updateActive()
    }
    readHeadings()
    const observer = new MutationObserver(readHeadings)
    observer.observe(container, { childList: true, subtree: true, characterData: true })
    scroll.addEventListener('scroll', updateActive, { passive: true })
    return () => { observer.disconnect(); scroll.removeEventListener('scroll', updateActive) }
  }, [article.id, article.body, article.editorDocument])

  const links = <nav aria-label="本文目录">{outline.map(entry => <a key={entry.id} href={`#${entry.id}`}
    style={{ paddingInlineStart: 12 + entry.depth * 12 }}
    aria-current={active === entry.id ? 'location' : undefined} onClick={event => {
      event.preventDefault()
      const target = headings.current.find(node => node.id === entry.id)
      target?.scrollIntoView({ block: 'start', behavior: 'instant' })
      target?.focus({ preventScroll: true })
      const scroll = root.current?.closest<HTMLElement>('[data-page-scroll]')
      if (scroll) clickedSection.current = { id: entry.id, scrollTop: scroll.scrollTop }
      setActive(entry.id)
    }}>{entry.title}</a>)}</nav>

  return <div ref={root} className="case-reader">
    <div className="case-reader-heading">
      {(article.category || article.tags.length > 0) && <div className="case-reader-tags">
        {article.category && <span>{article.category}</span>}{article.tags.map(tag => <span key={tag}>{tag}</span>)}
      </div>}
      <h1>{article.title}</h1>
      <div className="case-reader-author"><Avatar><AvatarImage src={article.authorAvatarUrl ?? undefined} alt="" /><AvatarFallback>{article.authorName.slice(0, 1)}</AvatarFallback></Avatar>
        <span>{article.authorName}</span>{article.college && <><span aria-hidden="true">·</span><span>{article.college}</span></>}<span aria-hidden="true">·</span><time dateTime={article.publishedAt ?? article.createdAt}>{caseDate(article)}</time>
      </div>
      {notice}
    </div>
    <div className="case-reading-layout">
      {outline.length > 0 && <details className="case-mobile-outline"><summary>本文目录</summary>{links}</details>}
      <article className="case-reading-column">
        <div className="case-reader-cover"><CaseCover title={article.title} coverText={article.coverText} coverColor={article.coverColor}
          className="h-full" /></div>
        <div ref={body} data-case-body className="case-body">{children}</div>
      </article>
      {outline.length > 0 && <aside className="case-outline"><p>本文目录</p>{links}</aside>}
    </div>
    {related.length > 0 && <section className="case-related" aria-label="相关案例"><h2>相关案例</h2><div className="case-grid">{related.map(item =>
      <CaseCard key={item.id} article={item} href={articleUrl(item.id)} onNavigate={() => onNavigate(item.id)} />
    )}</div></section>}
    {relatedError && <div className="case-related-error" role="status">相关案例暂时无法加载。<Button variant="ghost" size="sm" onClick={() => setRetry(value => value + 1)}>重试</Button></div>}
  </div>
}
