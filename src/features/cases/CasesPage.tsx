import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { markdownText, usableDocument } from '@/features/content-editor/document'
import { ContentEditor, ContentDocumentView } from '@/features/content-editor'
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
  const beginEdit = () => { setInput(article ? { title: article.title, summary: article.summary, body: article.body, editorDocument: article.editorDocument, summaryDocument: article.summaryDocument, cover: article.cover, category: article.category, tags: article.tags } : { ...empty }); setEditing(true); setPreview(false); setNotice(''); setError('') }
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
      setNotice(publish ? '案例已发布。' : '草稿已保存，读者看到的内容未改变。')
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
  const uploadAsset = async (file: File, cover = false): Promise<string> => {
    if (!input.title.trim()) throw new Error('请先填写案例标题。')
    if (file.size > 8 * 1024 * 1024) throw new Error('附件最大为 8 MB。')
    const images = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    if (cover && !images.includes(file.type)) throw new Error('请选择 PNG、JPEG、WebP 或 GIF 封面。')
    const supported = [...images,'audio/mpeg','audio/wav','audio/ogg','audio/mp4','video/mp4','video/webm','application/pdf']
    const mime = supported.includes(file.type) ? file.type : 'application/octet-stream'
    const operation = startMutation()
    if (!operation) throw new Error('请等待当前操作完成。')
    try {
      let target = article
      if (!target) { target = await casesApi.save(normalizedInput()); if (!operation.current()) throw new Error('页面已切换。'); adopt(target) }
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file) })
      if (!operation.current()) throw new Error('页面已切换。')
      const result = await (cover ? casesApi.image : casesApi.file)(target.id, mime, data)
      if (!operation.current()) throw new Error('页面已切换。')
      setNotice('附件已上传，请保存草稿或保存并发布。')
      return result.url
    } catch (reason) { if (operation.current()) setError(userFacingError(reason, '附件上传失败，请重试。')); throw reason }
    finally { operation.finish() }
  }
  const uploadCover = async (file?: File) => {
    if (!file) return
    try { const cover = await uploadAsset(file, true); setInput(value => ({ ...value, cover })) }
    catch (reason) { setError(userFacingError(reason, '封面上传失败，请重试。')) }
  }
  const canManage = article?.canManage ?? list.canManage
  return <main aria-label="组织案例库" className="h-full overflow-y-auto overscroll-contain">
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-8">
      <header className="mb-5 flex min-h-9 flex-wrap items-center justify-between gap-3 border-b pb-4">
        <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">案例库</h1>
        {!id && !editing && list.canManage && <Button size="sm" onClick={beginEdit}><Plus className="size-4" />新建案例</Button>}
        {(id || editing) && <Button variant="ghost" size="sm" disabled={busy} onClick={() => navigate()}><ArrowLeft className="size-4" />返回案例库</Button>}
      </header>
      {error && <div role="alert" className="mb-4 flex flex-wrap items-center gap-2 border-s-2 border-destructive px-3 text-sm text-destructive">{error}<Button variant="ghost" disabled={busy} onClick={() => setRevision(value => value + 1)}>重新加载</Button></div>}
      {notice && <p role="status" className="mb-4 text-sm text-muted-foreground">{notice}</p>}
      {!id && !editing && <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="relative min-w-40 flex-1"><span className="sr-only">关键词搜索</span><Search aria-hidden="true" className="pointer-events-none absolute start-3 top-2.5 size-4 text-muted-foreground"/><Input type="search" className="ps-9" placeholder="搜索案例" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label><span className="sr-only">分类</span><select value={category} onChange={event => setCategory(event.target.value)} className="h-9 max-w-48 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"><option value="">全部分类</option>{list.categories.map(value => <option key={value}>{value}</option>)}</select></label>
        {(search || category) && <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setCategory('') }}>清除筛选</Button>}
      </div>}
      {editing && canManage ? <form onSubmit={event => { event.preventDefault(); void save(false) }} className="mx-auto max-w-3xl"><fieldset disabled={busy} className="min-w-0 space-y-4">
        <p className="text-sm text-muted-foreground">{article?.status === 'published' ? '修改保存为草稿，发布后更新读者版本。' : '草稿仅教师可见。发布后，组织内学生可阅读。'}</p>
        <label className="block space-y-1.5 text-sm font-medium">标题<Input required maxLength={200} value={input.title} onChange={event => setInput({ ...input, title: event.target.value })} /></label>
        <div className="space-y-1.5"><p className="text-sm font-medium">摘要</p><ContentEditor legacyFormat="markdown" label="摘要" compact value={input.summary} document={input.summaryDocument} maxLength={2000} disabled={busy} uploadFile={file => uploadAsset(file)} onChange={(summary, summaryDocument) => setInput(value => ({ ...value, summary, summaryDocument }))}/></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1.5 text-sm font-medium">分类<Input maxLength={80} value={input.category} onChange={event => setInput({ ...input, category: event.target.value })} /></label><label className="block space-y-1.5 text-sm font-medium">标签（逗号分隔）<Input value={input.tags.join(',')} onChange={event => setInput({ ...input, tags: event.target.value.split(/[,，]/) })} /></label></div>
        <details className="border-y py-3" open={Boolean(input.cover)}><summary className="cursor-pointer text-sm focus-visible:outline-2">封面图片</summary><div className="space-y-2 pt-3"><label className="block space-y-1.5 text-sm">上传封面<Input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy || !input.title.trim()} onChange={event => { void uploadCover(event.target.files?.[0]); event.target.value = '' }} /></label>{input.cover && <><img src={input.cover} alt="案例封面预览" className="max-h-48 rounded-md object-contain"/><Button variant="ghost" size="sm" type="button" onClick={() => setInput({ ...input, cover: null })}>移除封面</Button></>}<p className="text-xs text-muted-foreground">先填写标题。图片上限 8 MB。</p></div></details>
        <div className="space-y-1.5"><p className="text-sm font-medium">正文</p><ContentEditor legacyFormat="markdown" label="正文" value={input.body} document={input.editorDocument} maxLength={200000} disabled={busy} uploadFile={file => uploadAsset(file)} onChange={(body, editorDocument) => setInput(value => ({ ...value, body, editorDocument }))}/></div>
        <Button type="button" size="sm" variant="ghost" aria-expanded={preview} onClick={() => setPreview(!preview)}>{preview ? '收起预览' : '预览正文'}</Button>
        {preview && <section aria-label="正文预览" className="border-t py-4">{usableDocument(input.editorDocument, input.body) ? <ContentDocumentView document={input.editorDocument}/> : <Markdown body={input.body}/>}</section>}
        <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-background py-3"><Button type="submit" variant="outline" disabled={busy || input.body.length > 200000 || input.summary.length > 2000}>保存草稿</Button><Button type="button" disabled={busy || !input.title.trim() || !input.body.trim() || input.body.length > 200000 || input.summary.length > 2000} onClick={() => void save(true)}>保存并发布</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>取消编辑</Button></div>
      </fieldset></form> : loading ? <p role="status" className="py-8 text-sm text-muted-foreground">正在加载案例…</p> : article ? <article className="mx-auto max-w-3xl">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{article.category || '未分类'}</span>{article.canManage && <><span>· {statusLabels[article.status]}</span>{article.hasUnpublishedChanges && <span>· 有未发布修改</span>}</>}</div>
        <h2 className="break-words text-2xl font-semibold leading-tight sm:text-3xl">{article.title}</h2>
        <div className="my-4 text-sm leading-7 text-muted-foreground">{usableDocument(article.summaryDocument, article.summary) ? <ContentDocumentView document={article.summaryDocument}/> : article.summary}</div>
        {article.canManage && <div className="mb-5 space-y-2 border-y py-3"><div className="flex flex-wrap gap-2"><Button size="sm" onClick={beginEdit}>编辑案例</Button>{article.status === 'published' && <Button size="sm" variant="outline" disabled={busy} onClick={() => void action('unpublish')}>下架案例</Button>}{article.indexStatus === 'failed' && <Button size="sm" variant="outline" disabled={busy} onClick={() => void action('retry-index')}>重试索引</Button>}</div>{article.hasUnpublishedChanges && <p className="text-xs text-muted-foreground">读者仍看到上次发布版本。</p>}{article.indexStatus && <p className="text-xs text-muted-foreground">知识索引：{article.indexStatus === 'failed' ? '同步失败，请重试' : article.indexStatus === 'ready' ? '已同步' : '正在同步'}</p>}</div>}
        {article.cover && <img src={article.cover} alt="" className="mb-6 max-h-96 w-full rounded-md object-contain"/>}
        {usableDocument(article.editorDocument, article.body) ? <ContentDocumentView document={article.editorDocument}/> : <Markdown body={article.body}/>}
        <div className="mt-6 flex flex-wrap gap-3 border-t pt-3 text-xs text-muted-foreground">{article.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
      </article> : !id ? <div className="divide-y">{list.items.map(item => <article key={item.id} className="min-w-0">
        <a href={articleUrl(item.id)} onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(item.id) } }} className="group flex items-start gap-4 rounded-sm py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <div className="min-w-0 flex-1"><h2 className="break-words text-base font-semibold leading-6 group-hover:text-primary">{item.title}</h2><p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{markdownText(item.summary)}</p><div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{item.category || '未分类'}</span>{list.canManage && <span>· {statusLabels[item.status]}</span>}{item.tags.slice(0,3).map(tag=><span key={tag}>#{tag}</span>)}</div></div>
          {item.cover && <img src={item.cover} alt="" loading="lazy" className="h-20 w-24 shrink-0 rounded-md object-cover sm:w-32"/>}
        </a>
      </article>)}
        {!list.items.length && !error && <div className="py-12 text-center"><h2 className="text-sm font-medium">{search || category ? '没有找到匹配的案例' : '还没有案例'}</h2><p className="mt-2 text-sm text-muted-foreground">{search || category ? '试试其他关键词或分类。' : list.canManage ? '新建案例并发布后，组织内的学生即可阅读。' : '教师发布案例后，你可以在这里阅读。'}</p></div>}
      </div> : null}
    </div>
  </main>
}
