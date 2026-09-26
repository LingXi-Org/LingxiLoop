import { useEffect, useRef, useState } from 'react'
import { Cancel01Icon, Mail01Icon, PlusSignIcon, SearchIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { SidebarHeader } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { userFacingError } from '@/lib/userFacingError'
import { emailApi } from '../api'
import type { EmailMessage, EmailThread } from '../contracts'
import { useEmailComposer } from '../state'
import { EmailComposer } from './EmailComposer'

function EmailBody({ message }: { message: EmailMessage }) {
  const [html, setHtml] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showHtml, setShowHtml] = useState(false)
  const loadHtml = async () => {
    if (html !== null) { setShowHtml(value => !value); return }
    setBusy(true); setError('')
    try {
      const result = await emailApi.fetchEmailHtml(message.id)
      if (result === null) setError('此邮件没有 HTML 正文。')
      else { setHtml(result); setShowHtml(true) }
    } catch (reason) { setError(userFacingError(reason, '正文加载失败，请重试。')) }
    finally { setBusy(false) }
  }
  return <>
    {message.email.hasHtml && <Button variant="outline" size="sm" disabled={busy} onClick={() => void loadHtml()}>{busy ? '加载正文…' : showHtml ? '查看纯文本' : '查看 HTML 正文'}</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {showHtml && html !== null
      ? <iframe title={`${message.email.subject}的邮件正文`} sandbox="" referrerPolicy="no-referrer" srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:; base-uri 'none'; form-action 'none'">${html}`} className="min-h-96 w-full rounded-lg border bg-white" />
      : <p className="whitespace-pre-wrap break-words text-sm leading-7">{message.body || '（无纯文本正文）'}</p>}
  </>
}

function MailThread({ id, onBack, revision, onReplyContext }: {
  id: string; onBack(): void; revision: number
  onReplyContext(value: { subject: string; from: string }): void
}) {
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [olderLoading, setOlderLoading] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const generation = useRef(0)
  useEffect(() => {
    const controller = new AbortController()
    generation.current += 1
    setLoading(true); setMessages([]); setHasOlder(false); setOlderLoading(false); setError('')
    void emailApi.getMessages(id, undefined, controller.signal).then(rows => {
      if (controller.signal.aborted) return
      setMessages(rows); setHasOlder(rows.length === 50)
    }).catch(reason => {
      if (!controller.signal.aborted) setError(userFacingError(reason, '邮件读取失败，请重试。'))
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { generation.current += 1; controller.abort() }
  }, [id, revision, retry])
  const loadOlder = async () => {
    if (!messages.length || olderLoading) return
    const epoch = generation.current
    setOlderLoading(true); setError('')
    try {
      const rows = await emailApi.getMessages(id, messages[0].sequence)
      if (generation.current !== epoch) return
      setMessages(current => [...rows, ...current]); setHasOlder(rows.length === 50)
    } catch (reason) { if (generation.current === epoch) setError(userFacingError(reason, '历史邮件加载失败。')) }
    finally { if (generation.current === epoch) setOlderLoading(false) }
  }
  return <section aria-label="邮件阅读区" className="flex min-h-0 min-w-0 flex-1 flex-col">
    <header className="flex flex-wrap items-center gap-2 border-b p-4"><Button variant="ghost" className="md:hidden" onClick={onBack}>返回邮件列表</Button><h2 className="min-w-0 flex-1 truncate font-semibold">{messages.at(-1)?.email.subject || '邮件详情'}</h2><Button variant="outline" size="sm" disabled={loading} onClick={() => setRetry(value => value + 1)}>刷新</Button></header>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 md:p-6">
      {loading && <p role="status" className="text-sm text-muted-foreground">正在读取邮件…</p>}
      {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>重试</Button></div>}
      {!loading && !error && !messages.length && <p className="text-sm text-muted-foreground">该会话暂无邮件。</p>}
      {hasOlder && <Button variant="outline" disabled={olderLoading || loading} onClick={() => void loadOlder()}>{olderLoading ? '加载中…' : '加载更早邮件'}</Button>}
      {messages.map(message => <article key={message.id} className="space-y-4 rounded-xl border p-4 md:p-5">
        <header className="space-y-1 text-sm"><div className="flex flex-wrap items-start gap-2"><span className="min-w-0 flex-1 break-all font-medium">{message.email.from}</span><time className="text-xs text-muted-foreground" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></div><p className="break-all text-xs text-muted-foreground">收件人：{message.email.to.join('、')}</p>{message.email.cc.length > 0 && <p className="break-all text-xs text-muted-foreground">抄送：{message.email.cc.join('、')}</p>}{message.email.transportStatus === 'failed' && <p className="text-destructive">发送失败</p>}</header>
        <EmailBody message={message} />
        {message.email.attachments.length > 0 && <ul aria-label="附件" className="space-y-2">{message.email.attachments.map(attachment => <li key={attachment.id} className="break-all rounded-lg bg-muted p-3 text-sm">{attachment.url && /^https?:\/\//i.test(attachment.url) && !attachment.truncated ? <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 focus-visible:outline-2">{attachment.filename}</a> : <span>{attachment.filename} · 附件不可用</span>}</li>)}</ul>}
        <Button variant="outline" size="sm" onClick={() => { onReplyContext({ subject: message.email.subject, from: message.email.from }); useEmailComposer.getState().openComposeReply(message.id) }}>回复</Button>
      </article>)}
    </div>
  </section>
}

export function MailPage() {
  const mobile = useIsMobile()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [threads, setThreads] = useState<EmailThread[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [moreLoading, setMoreLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [replyContext, setReplyContext] = useState<{ subject: string; from: string }>()
  const generation = useRef(0)
  useEffect(() => {
    useEmailComposer.getState().closeCompose()
    return () => { generation.current += 1; useEmailComposer.getState().closeCompose() }
  }, [])
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 250); return () => clearTimeout(timer) }, [search])
  useEffect(() => {
    const controller = new AbortController()
    generation.current += 1
    setLoading(true); setThreads([]); setHasMore(false); setMoreLoading(false); setError('')
    void emailApi.listThreads(query, 0, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setThreads(result.items); setHasMore(result.hasMore)
    }).catch(reason => {
      if (!controller.signal.aborted) setError(userFacingError(reason, '邮件列表加载失败，请重试。'))
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query, revision])
  const loadMore = async () => {
    if (moreLoading) return
    const epoch = generation.current
    setMoreLoading(true); setError('')
    try {
      const result = await emailApi.listThreads(query, threads.length)
      if (generation.current !== epoch) return
      setThreads(current => [...current, ...result.items.filter(item => !current.some(existing => existing.conversationId === item.conversationId))]); setHasMore(result.hasMore)
    } catch (reason) { if (generation.current === epoch) setError(userFacingError(reason, '邮件列表加载失败。')) }
    finally { if (generation.current === epoch) setMoreLoading(false) }
  }
  return <div className="flex h-full min-h-0 min-w-0" data-page="mail">
    {(!mobile || !selectedId) && <section data-slot="sidebar" aria-label="邮件列表" className="im-conversations-sidebar relative flex min-h-0 min-w-0 w-full flex-col overflow-hidden border-e bg-sidebar text-sidebar-foreground md:w-80 md:shrink-0">
      <SidebarHeader className="desktop-window-toolbar omb-drag shrink-0 gap-0 p-0">
        <h1 className={mobile ? 'h-12 shrink-0 px-4 font-heading text-xl font-medium leading-[48px]' : 'sr-only'}>邮件</h1>
        <div className={cn('im-navigation-row flex min-w-0 items-center gap-2', mobile ? 'px-3' : 'px-2')}>
          <InputGroup className={cn('omb-no-drag min-w-0 flex-1 rounded-xl border-transparent bg-sidebar-accent shadow-none', mobile ? 'h-10' : 'h-8')}>
            <InputGroupInput aria-label="搜索邮件标题或发件人" placeholder="搜索邮件" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setSearch('') }} className={cn('px-2 text-sm', mobile ? 'h-10' : 'h-8')} />
            <InputGroupAddon><HugeiconsIcon icon={SearchIcon} strokeWidth={2} className="size-4" /></InputGroupAddon>
            {search && <InputGroupAddon align="inline-end"><Button type="button" variant="ghost" size="icon-xs" className={mobile ? 'size-8' : undefined} onClick={() => setSearch('')} aria-label="清除搜索"><HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} /></Button></InputGroupAddon>}
          </InputGroup>
          <Button type="button" variant="secondary" size={mobile ? 'icon-lg' : 'icon-sm'} className="omb-no-drag shrink-0 rounded-full bg-sidebar-accent text-muted-foreground hover:bg-[var(--im-conversation-hover)] hover:text-sidebar-foreground" aria-label="写邮件" title="写邮件" onClick={() => { setReplyContext(undefined); useEmailComposer.getState().openComposeNew() }}><HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} /></Button>
        </div>
      </SidebarHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && <p role="status" className="p-4 text-sm text-muted-foreground">正在加载邮件…</p>}
        {error && <div role="alert" className="space-y-2 p-4 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>重试</Button></div>}
        {!loading && !error && !threads.length && <p className="p-6 text-sm text-muted-foreground">{query ? '没有找到匹配的邮件。' : '当前工作区还没有邮件。'}</p>}
        {threads.map(thread => {
          const selected = selectedId === thread.conversationId
          return <button type="button" key={thread.conversationId} aria-current={selected ? 'page' : undefined} onClick={() => setSelectedId(thread.conversationId)} className={cn('im-navigation-row im-conversation-row relative flex w-full items-center gap-2.5 overflow-hidden rounded-none border-0 px-3 text-start shadow-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', mobile ? 'py-2' : 'py-1.5', selected ? 'bg-[var(--im-conversation-selected)] text-sidebar-primary-foreground' : 'bg-transparent text-sidebar-foreground hover:bg-[var(--im-conversation-hover)]')}>
            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', selected ? 'bg-sidebar-primary-foreground/15' : 'bg-sidebar-accent text-muted-foreground')}><HugeiconsIcon icon={Mail01Icon} strokeWidth={1.8} className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium">{thread.lastSubject || thread.title || '无主题'}</span><time className={cn('shrink-0 text-[10px]', selected ? 'text-sidebar-primary-foreground/85' : 'text-muted-foreground')} dateTime={thread.lastAt ?? thread.updatedAt}>{new Date(thread.lastAt ?? thread.updatedAt).toLocaleDateString()}</time></span><span className={cn('mt-1 block truncate text-xs', selected ? 'text-sidebar-primary-foreground/85' : 'text-muted-foreground')}>{thread.lastFrom || '未知发件人'}：{thread.lastBody}</span></span>
          </button>
        })}
        {hasMore && <div className="p-4"><Button variant="outline" disabled={moreLoading || loading} onClick={() => void loadMore()}>{moreLoading ? '加载中…' : '加载更多'}</Button></div>}
      </div>
      <div className="shrink-0 px-2 py-1"><Button variant="ghost" size="sm" className="text-xs text-muted-foreground" disabled={loading} onClick={() => setRevision(value => value + 1)}>刷新邮件</Button></div>
    </section>}
    {selectedId ? <MailThread key={selectedId} id={selectedId} onBack={() => setSelectedId(null)} revision={revision} onReplyContext={setReplyContext} /> : !mobile && <div className="grid flex-1 place-items-center p-6 text-sm text-muted-foreground">选择一封邮件开始阅读</div>}
    <EmailComposer replyContext={replyContext} onSent={id => { setSelectedId(id); setSearch(''); setRevision(value => value + 1) }} />
  </div>
}
