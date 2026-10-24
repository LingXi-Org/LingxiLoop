import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './cases.css'
import { ArrowLeft, BookImage, ImagePlus, LockKeyhole, MoreHorizontal, Pencil, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { markdownText, usableDocument } from '@/features/content-editor/document'
import { ContentEditor, ContentDocumentView } from '@/features/content-editor'
import { CodeBlock } from '@/features/learning/forum/memos/CodeBlock'
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
  return <div className="case-markdown space-y-5 break-words text-base leading-8 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:text-xl [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:focus-visible:outline-2 [&_img]:my-6 [&_img]:max-h-[36rem] [&_img]:rounded-xl [&_img]:object-contain [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-0 [&_blockquote]:border-s-2 [&_blockquote]:ps-4"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{pre: CodeBlock, table: ({children}) => <div className="overflow-x-auto"><table>{children}</table></div>}}>{body}</ReactMarkdown></div>
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
  const content = editing ? input : article
  const detail = Boolean(id || editing)
  const invalid = busy || !input.title.trim() || input.body.length > 200000 || input.summary.length > 2000
  const date = (value: CaseArticle) => new Date(value.publishedAt ?? value.createdAt ?? value.updatedAt).toLocaleDateString('zh-CN').replaceAll('/', '.')
  const body = (value: CaseInput) => usableDocument(value.editorDocument, value.body) ? <ContentDocumentView document={value.editorDocument}/> : <Markdown body={value.body}/>
  const hero = content && <div data-case-hero className="case-hero">
    <div className="case-cover">
      {content.cover ? <img src={content.cover} alt={editing ? '案例封面预览' : ''}/> : <div className="case-no-cover"><BookImage aria-hidden="true"/><span>{editing ? '添加案例封面' : '暂无封面'}</span></div>}
      {editing && !preview && <div className="case-cover-actions">
        {input.cover && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setInput(value => ({...value, cover: null}))}>移除封面</Button>}
        <label className="case-cover-upload" aria-disabled={busy || !input.title.trim()}>
          <ImagePlus aria-hidden="true" className="size-4"/>{input.cover ? '更换封面' : '上传封面'}
          <input className="sr-only" aria-label="上传封面" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy || !input.title.trim()} onChange={event => { void uploadCover(event.target.files?.[0]); event.target.value = '' }}/>
        </label>
      </div>}
    </div>
    <div className="case-hero-copy">
      {editing && <div hidden={preview}>
        <label><span className="sr-only">标题</span><Textarea required maxLength={200} disabled={busy} className="case-title-input" placeholder="案例标题" rows={1} value={input.title} onChange={event => setInput(value => ({...value, title: event.target.value}))}/></label>
        <div className="case-summary case-inline-editor"><ContentEditor legacyFormat="markdown" label="摘要" compact value={input.summary} document={input.summaryDocument} maxLength={2000} disabled={busy} uploadFile={file => uploadAsset(file)} onChange={(summary, summaryDocument) => setInput(value => ({...value, summary, summaryDocument}))}/></div>
      </div>}
      {(!editing || preview) && <div><h2 className="case-title">{content.title}</h2><div className="case-summary">{usableDocument(content.summaryDocument, content.summary) ? <ContentDocumentView document={content.summaryDocument}/> : <p>{content.summary}</p>}</div></div>}
      {editing && !preview ? <div className="case-edit-metadata">
        <label className="flex items-center gap-2 text-sm"><span>分类</span><Input list="case-categories" aria-label="分类" maxLength={80} className="w-28" value={input.category} onChange={event => setInput(value => ({...value, category: event.target.value}))}/></label>
        <datalist id="case-categories">{list.categories.map(value => <option key={value} value={value}/>)}</datalist>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm"><span className="shrink-0">标签</span><Input aria-label="标签（逗号分隔）" placeholder="用逗号分隔" value={input.tags.join(',')} onChange={event => setInput(value => ({...value, tags: event.target.value.split(/[,，]/)}))}/></label>
        <span className="flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole aria-hidden="true" className="size-4"/>{article?.status === 'published' ? '未发布修改仅教师可见' : '草稿仅教师可见'}</span>
      </div> : <div className="case-metadata">
        {article && <time dateTime={article.publishedAt ?? article.createdAt ?? article.updatedAt}>{date(article)}</time>}
        <span>{content.category || '未分类'}</span>
        {content.tags.map(tag => <span key={tag}>{tag}</span>)}
        {article?.authorName && <span className="case-author"><Avatar size="sm"><AvatarImage src={article.authorAvatarUrl ?? undefined} alt=""/><AvatarFallback>{article.authorName.slice(0, 1)}</AvatarFallback></Avatar>{article.authorName}</span>}
        <span className="case-status">{editing && preview ? '草稿预览' : statusLabels[article?.status ?? 'draft']}</span>
      </div>}
    </div>
  </div>
  return <main aria-label="组织案例库" className="cases-page">
    <div className={detail ? 'case-detail-shell' : 'case-library-shell'}>
      <header className={'case-toolbar ' + (detail ? 'case-detail-toolbar' : '')}>
        <h1 ref={heading} tabIndex={-1} className={detail ? 'sr-only' : 'case-library-title'}>案例库</h1>
        {detail && <Button variant="ghost" disabled={busy} onClick={() => navigate()}><ArrowLeft className="size-4"/>返回案例库</Button>}
        <div className="ms-auto flex flex-wrap items-center justify-end gap-3">
          {!detail && list.canManage && <Button onClick={beginEdit}><Plus className="size-4"/>新建案例</Button>}
          {editing && canManage ? <>
            <span className="text-sm text-muted-foreground">草稿</span>
            <Button type="submit" form="case-edit-form" variant="outline" disabled={invalid}>保存草稿</Button>
            <Button type="button" variant="outline" aria-pressed={preview} disabled={busy} onClick={() => setPreview(value => !value)}>{preview ? '继续编辑' : '预览'}</Button>
            <Button type="button" disabled={invalid || !input.body.trim()} onClick={() => void save(true)}>发布</Button>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="编辑选项" disabled={busy}><MoreHorizontal/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setEditing(false)}>取消编辑</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          </> : article?.canManage && <>
            <Button variant="outline" onClick={beginEdit}><Pencil className="size-4"/>编辑案例</Button>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="更多案例操作" disabled={busy}><MoreHorizontal/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
              {article.status === 'published' && <DropdownMenuItem onSelect={() => void action('unpublish')}>下架案例</DropdownMenuItem>}
              {article.indexStatus === 'failed' && <DropdownMenuItem onSelect={() => void action('retry-index')}>重试索引</DropdownMenuItem>}
              <DropdownMenuItem disabled>知识索引：{article.indexStatus === 'ready' ? '已同步' : article.indexStatus === 'failed' ? '同步失败' : article.indexStatus ? '正在同步' : '未发布'}</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
          </>}
        </div>
      </header>
      {error && <div role="alert" className="case-notice text-destructive">{error}<Button variant="ghost" disabled={busy} onClick={() => setRevision(value => value + 1)}>重新加载</Button></div>}
      {notice && <p role="status" className="case-notice">{notice}</p>}
      {!detail && <div className="case-library-filters">
        <nav aria-label="案例分类" className="case-category-tabs">
          {['', ...list.categories].map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>{value || '全部'}</button>)}
        </nav>
        <label className="relative w-full sm:w-72"><span className="sr-only">关键词搜索</span><Search aria-hidden="true" className="pointer-events-none absolute start-3 top-2.5 size-4 text-muted-foreground"/><Input type="search" className="ps-9" placeholder="搜索案例" value={search} onChange={event => setSearch(event.target.value)}/></label>
        {(search || category) && <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setCategory('') }}>清除筛选</Button>}
      </div>}
      {editing && canManage ? <form id="case-edit-form" onSubmit={event => { event.preventDefault(); void save(false) }}>
        <fieldset disabled={busy} className="min-w-0">
          <section aria-label={preview ? '案例预览' : '编辑案例'}>{hero}
            <div className="case-body-divider"><div data-case-body className="case-body">
              <div hidden={preview} className="case-inline-editor"><ContentEditor legacyFormat="markdown" label="正文" value={input.body} document={input.editorDocument} maxLength={200000} disabled={busy} uploadFile={file => uploadAsset(file)} onChange={(body, editorDocument) => setInput(value => ({...value, body, editorDocument}))}/></div>
              {preview && body(input)}
            </div></div>
          </section>
          {!input.title.trim() && <p className="case-notice text-xs">填写标题后可上传封面与附件，单个文件最大 8 MB。</p>}
        </fieldset>
      </form> : loading ? <p role="status" className="case-notice py-8">正在加载案例…</p> : article ? <article>
        {hero}
        {article.canManage && article.hasUnpublishedChanges && <p className="case-notice">当前显示教师草稿；读者仍看到上次发布版本。</p>}
        <div className="case-body-divider"><div data-case-body className="case-body">{body(article)}</div></div>
      </article> : !id ? <>
        <div data-case-grid className="case-grid">{list.items.map(item => <article key={item.id}>
          <a href={articleUrl(item.id)} onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(item.id) } }} className="case-grid-link">
            <div className="case-grid-cover">{item.cover ? <img src={item.cover} alt="" loading="lazy"/> : <div className="case-no-cover"><BookImage aria-hidden="true"/><span>暂无封面</span></div>}</div>
            <div className="case-grid-meta"><time dateTime={item.publishedAt ?? item.createdAt ?? item.updatedAt}>{date(item)}</time><span>·</span><span>{item.category || '未分类'}</span>{list.canManage && item.status !== 'published' && <span>{statusLabels[item.status]}</span>}</div>
            <h2>{item.title}</h2><p>{markdownText(item.summary)}</p>
          </a>
        </article>)}</div>
        {!list.items.length && !error && <div className="py-12 text-center"><h2 className="text-sm font-medium">{search || category ? '没有找到匹配的案例' : '还没有案例'}</h2><p className="mt-2 text-sm text-muted-foreground">{search || category ? '试试其他关键词或分类。' : list.canManage ? '新建案例并发布后，组织内的学生即可阅读。' : '教师发布案例后，你可以在这里阅读。'}</p></div>}
      </> : null}
    </div>
  </main>
}
