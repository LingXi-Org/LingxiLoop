import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, BookOpen, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/stores/auth'
import { userFacingError } from '@/lib/userFacingError'
import { casesApi, type CaseArticle, type CaseInput, type CaseList } from './api'

const empty: CaseInput = { title: '', summary: '', body: '', cover: null, category: '', tags: [] }
const statusLabels = { draft: '草稿', published: '已发布', unpublished: '已下架' }
function routeId() {
  const match = /^\/cases\/([^/]+)$/.exec(window.location.pathname)
  try { return match ? decodeURIComponent(match[1]) : new URLSearchParams(window.location.search).get('case') } catch { return '__invalid_case_url__' }
}
function articleUrl(id?: string) {
  const query = new URLSearchParams(window.location.search)
  query.set('view', 'cases')
  const company = useAuth.getState().activeCompanyId
  if (company) query.set('company', company)
  query.delete('case')
  query.delete('conversation')
  return `/cases${id ? `/${encodeURIComponent(id)}` : ''}?${query}`
}
function Markdown({ body }: { body: string }) {
  return <div className="space-y-5 break-words text-base leading-8 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:text-xl [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:focus-visible:outline-2 [&_img]:my-6 [&_img]:max-h-[36rem] [&_img]:rounded-xl [&_img]:object-contain [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_blockquote]:border-s-2 [&_blockquote]:ps-4"><ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown></div>
}

export function CasesPage() {
  const companyId = useAuth(state => state.activeCompanyId)
  const [id, setId] = useState(routeId)
  const [list, setList] = useState<CaseList>({ items: [], categories: [], canManage: false })
  const [article, setArticle] = useState<CaseArticle | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState<CaseInput>(empty)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const operationEpoch = useRef(0)
  const mutationPending = useRef(false)
  const readRequest = useRef<AbortController | null>(null)
  const adoptedId = useRef<string | null>(null)
  const skipFocus = useRef(false)
  const currentScope = useRef(companyId)
  useEffect(() => { currentScope.current = companyId; return () => { currentScope.current = null; operationEpoch.current += 1 } }, [companyId])
  const navigate = (next?: string) => {
    operationEpoch.current += 1
    mutationPending.current = false; setBusy(false)
    window.history.pushState(null, '', articleUrl(next))
    setId(next ?? null); setRevision(value => value + 1); setEditing(false); setNotice(''); setError('')
  }
  useEffect(() => {
    const restore = () => { operationEpoch.current += 1; mutationPending.current = false; setBusy(false); setId(routeId()); setRevision(value => value + 1); setEditing(false); setNotice('') }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  useEffect(() => {
    if (adoptedId.current === id && id) { adoptedId.current = null; setLoading(false); return }
    const abort = new AbortController()
    readRequest.current = abort
    const requestedCompany = new URLSearchParams(window.location.search).get('company')
    if (requestedCompany && requestedCompany !== companyId) { setLoading(false); setArticle(null); setList({ items: [], categories: [], canManage: false }); setError('此案例属于其他组织，当前账号无权访问。'); return }
    setLoading(true); setError(''); if (!editing) setArticle(null)
    const timer = window.setTimeout(() => {
      const request = id ? casesApi.detail(id, abort.signal).then(value => { if (!abort.signal.aborted) setArticle(value) }) : casesApi.list(search, category, abort.signal).then(value => { if (!abort.signal.aborted) setList(value) })
      void request.catch(reason => { if (!abort.signal.aborted) { setError(userFacingError(reason, '案例暂时无法加载，请重试。')); if (!id) setList(value => ({ ...value, items: [] })) } }).finally(() => { if (!abort.signal.aborted) setLoading(false) })
    }, id ? 0 : 200)
    return () => { abort.abort(); window.clearTimeout(timer) }
  }, [id, search, category, revision])
  useEffect(() => { if (skipFocus.current) { skipFocus.current = false; return }; heading.current?.focus({ preventScroll: true }) }, [id])
  const beginEdit = () => { setInput(article ? { title: article.title, summary: article.summary, body: article.body, cover: article.cover, category: article.category, tags: article.tags } : { ...empty }); setEditing(true); setPreview(false); setNotice(''); setError('') }
  // Navigation invalidates completions; a settled request must never mutate a new page.
  const startMutation = () => {
    if (mutationPending.current || currentScope.current !== companyId || useAuth.getState().activeCompanyId !== companyId || !useAuth.getState().user) return null
    mutationPending.current = true
    readRequest.current?.abort()
    setLoading(false); setBusy(true); setError(''); setNotice('')
    const epoch = ++operationEpoch.current
    const userId = useAuth.getState().user?.id
    const current = () => operationEpoch.current === epoch && currentScope.current === companyId
      && useAuth.getState().activeCompanyId === companyId && useAuth.getState().user?.id === userId
    return { current, finish: () => { if (current()) { mutationPending.current = false; setBusy(false) } } }
  }
  const adopt = (saved: CaseArticle) => {
    setArticle(saved)
    if (!id) {
      adoptedId.current = saved.id; skipFocus.current = true
      window.history.pushState(null, '', articleUrl(saved.id)); setId(saved.id)
    }
  }
  const normalizedInput = () => ({ ...input, tags: [...new Set(input.tags.map(tag => tag.trim()).filter(Boolean))] })
  const save = async (publish: boolean) => {
    const operation = startMutation()
    if (!operation) return
    let draftSaved = false
    try {
      let saved = await casesApi.save(normalizedInput(), article ?? undefined)
      if (!operation.current()) return
      draftSaved = true; adopt(saved)
      if (publish) { saved = await casesApi.action(saved, 'publish'); if (!operation.current()) return; setArticle(saved) }
      setNotice(publish ? '案例已发布，知识索引正在同步。' : '草稿已保存，读者看到的内容未改变。')
      setEditing(false); setRevision(value => value + 1)
    } catch (reason) {
      if (operation.current()) {
        if (draftSaved && publish) setNotice('草稿已保存，但尚未发布。输入内容已保留，可以重新尝试发布。')
        setError(userFacingError(reason, '保存失败，请重试。内容冲突时请重新加载后编辑。'))
      }
    } finally { operation.finish() }
  }
  const action = async (kind: 'unpublish' | 'retry-index') => {
    if (!article) return
    const operation = startMutation()
    if (!operation) return
    try { const next = await casesApi.action(article, kind); if (!operation.current()) return; setArticle(next); setNotice(kind === 'unpublish' ? '案例已下架，学生不可阅读或检索。' : '已提交索引重试。') }
    catch (reason) { if (operation.current()) setError(userFacingError(reason, '操作失败，请重试。')) }
    finally { operation.finish() }
  }
  const upload = async (file: File | undefined, cover: boolean) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 8 * 1024 * 1024) { setError('请选择 8 MB 以内的 PNG、JPEG、WebP 或 GIF 图片。'); return }
    const operation = startMutation()
    if (!operation) return
    try {
      let target = article
      if (!target) { target = await casesApi.save(normalizedInput()); if (!operation.current()) return; adopt(target) }
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file) })
      if (!operation.current()) return
      const result = await casesApi.image(target.id, file.type, data)
      if (!operation.current()) return
      setInput(value => cover ? { ...value, cover: result.url } : { ...value, body: `${value.body}\n\n![${file.name.replace(/[[\]]/g, '')}](${result.url})\n` })
      setNotice('图片已上传，请保存草稿或保存并发布。')
    } catch (reason) { if (operation.current()) setError(userFacingError(reason, '图片上传失败，请重试。')) }
    finally { operation.finish() }
  }
  const canManage = article?.canManage ?? list.canManage
  return <main aria-label="组织案例库" className="h-full overflow-y-auto overscroll-contain">
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground">组织共享 · 跨课程阅读</p><h1 ref={heading} tabIndex={-1} className="text-3xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">案例库</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">从实践中发现思路，让经验成为下一次探索的起点。</p></div>
        {!id && !editing && list.canManage && <Button onClick={beginEdit}><Plus className="size-4" />新建案例</Button>}
      </header>
      {(id || editing) && <Button variant="ghost" disabled={busy} onClick={() => navigate()} className="mb-5"><ArrowLeft className="size-4" />返回案例库</Button>}
      {error && <div role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}<Button variant="ghost" disabled={busy} onClick={() => setRevision(value => value + 1)}>重新加载</Button></div>}
      {notice && <p role="status" className="mb-5 rounded-xl bg-muted p-4 text-sm">{notice}</p>}
      {!id && !editing && <div className="mb-8 grid gap-4 sm:grid-cols-[1fr_14rem]"><label className="space-y-2 text-sm font-medium">关键词搜索<Input type="search" placeholder="搜索标题、摘要或正文" value={search} onChange={event => setSearch(event.target.value)} /></label><label className="space-y-2 text-sm font-medium">分类<select value={category} onChange={event => setCategory(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"><option value="">全部分类</option>{list.categories.map(value => <option key={value}>{value}</option>)}</select></label></div>}
      {editing && canManage ? <form onSubmit={event => { event.preventDefault(); void save(false) }} className="mx-auto max-w-3xl"><fieldset disabled={busy} className="min-w-0 space-y-6">
        <div className="rounded-xl bg-muted p-4 text-sm leading-6">{article?.status === 'published' ? '正在编辑草稿。未发布修改不会影响读者或知识检索；点击“保存并发布”后公开更新。' : '草稿仅教师可见。准备好后点击“保存并发布”，组织内的学生即可阅读。'}</div>
        <label className="block space-y-2 text-sm font-medium">标题<Input required maxLength={200} value={input.title} onChange={event => setInput({ ...input, title: event.target.value })} /></label>
        <label className="block space-y-2 text-sm font-medium">摘要<Textarea maxLength={1000} value={input.summary} onChange={event => setInput({ ...input, summary: event.target.value })} /></label>
        <div className="grid gap-5 sm:grid-cols-2"><label className="block space-y-2 text-sm font-medium">分类<Input maxLength={80} value={input.category} onChange={event => setInput({ ...input, category: event.target.value })} /></label><label className="block space-y-2 text-sm font-medium">标签（逗号分隔）<Input value={input.tags.join(',')} onChange={event => setInput({ ...input, tags: event.target.value.split(/[,，]/) })} /></label></div>
        <div className="space-y-3"><label className="block space-y-2 text-sm font-medium">上传封面<Input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy || !input.title.trim()} onChange={event => { void upload(event.target.files?.[0], true); event.target.value = '' }} /></label>{input.cover && <><img src={input.cover} alt="案例封面预览" className="aspect-video w-full rounded-xl object-cover" /><Button variant="outline" type="button" onClick={() => setInput({ ...input, cover: null })}>移除封面</Button></>}<p className="text-xs text-muted-foreground">先填写标题再上传图片，最大 8 MB。首次上传会创建教师可见的草稿。</p></div>
        <label className="block space-y-2 text-sm font-medium">正文（Markdown）<Textarea className="min-h-80 font-mono text-sm" value={input.body} onChange={event => setInput({ ...input, body: event.target.value })} /></label>
        <p className="text-xs text-muted-foreground">支持标题、列表、图文和链接。链接格式：[链接文字](https://example.com)。</p>
        <label className="block space-y-2 text-sm font-medium">插入正文图片<Input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy || !input.title.trim()} onChange={event => { void upload(event.target.files?.[0], false); event.target.value = '' }} /></label>
        <Button type="button" variant="outline" aria-expanded={preview} onClick={() => setPreview(!preview)}>{preview ? '收起预览' : '预览正文'}</Button>
        {preview && <section aria-label="正文预览" className="rounded-xl border p-5"><Markdown body={input.body} /></section>}
        <div className="sticky bottom-0 flex flex-wrap gap-3 border-t bg-background py-4"><Button type="submit" variant="outline" disabled={busy}>保存草稿</Button><Button type="button" disabled={busy || !input.title.trim() || !input.body.trim()} onClick={() => void save(true)}>保存并发布</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>取消编辑</Button></div>
      </fieldset></form> : loading ? <p role="status" className="py-12 text-center text-muted-foreground">正在加载案例…</p> : article ? <article className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span>{article.category || '未分类'}</span>{article.canManage && <><span>{statusLabels[article.status]}</span>{article.hasUnpublishedChanges && <span>有未发布修改</span>}</>}</div>
        <h2 className="break-words text-3xl font-semibold leading-tight sm:text-4xl">{article.title}</h2><p className="my-6 text-lg leading-8 text-muted-foreground">{article.summary}</p>
        {article.canManage && <div className="mb-6 space-y-3"><div className="flex flex-wrap gap-3"><Button onClick={beginEdit}>编辑案例</Button>{article.status === 'published' && <Button variant="outline" disabled={busy} onClick={() => void action('unpublish')}>下架案例</Button>}{article.indexStatus === 'failed' && <Button variant="outline" disabled={busy} onClick={() => void action('retry-index')}>重试索引</Button>}</div>{article.hasUnpublishedChanges && <p className="text-sm text-muted-foreground">当前显示教师草稿；读者仍看到上次发布版本。</p>}{article.indexStatus && <p className="text-sm text-muted-foreground">知识索引：{article.indexStatus === 'failed' ? '同步失败，请重试' : article.indexStatus === 'ready' ? '已同步' : '正在同步'}</p>}</div>}
        {article.cover && <img src={article.cover} alt="" className="mb-8 aspect-video w-full rounded-2xl object-cover" />}<Markdown body={article.body} /><div className="mt-10 flex flex-wrap gap-2">{article.tags.map(tag => <span key={tag} className="rounded-full bg-muted px-3 py-1 text-xs">{tag}</span>)}</div>
      </article> : !id ? <>
        <div className="grid grid-cols-1 gap-x-7 gap-y-10 md:grid-cols-2 xl:grid-cols-3">{list.items.map(item => <article key={item.id} className="min-w-0"><a href={articleUrl(item.id)} onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(item.id) } }} className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"><div className="mb-4 aspect-[16/10] overflow-hidden rounded-xl bg-muted">{item.cover ? <img src={item.cover} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><BookOpen className="size-12" strokeWidth={1} /></div>}</div><div className="mb-2 flex flex-wrap gap-2 text-xs font-medium text-muted-foreground"><span>{item.category || '未分类'}</span>{list.canManage && <span>· {statusLabels[item.status]}</span>}</div><h2 className="mb-3 break-words text-xl font-semibold leading-7 group-hover:underline">{item.title}</h2><p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{item.summary}</p></a></article>)}</div>
        {!list.items.length && !error && <div className="rounded-xl border border-dashed p-12 text-center"><h2 className="font-medium">{search || category ? '没有找到匹配的案例' : '案例库等待第一篇故事'}</h2><p className="mt-2 text-sm text-muted-foreground">{search || category ? '试试其他关键词或分类。' : list.canManage ? '创建案例，与组织内的师生分享实践经验。' : '教师发布案例后，你可以在这里阅读。'}</p></div>}
      </> : null}
    </div>
  </main>
}
