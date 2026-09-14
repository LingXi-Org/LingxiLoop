import { useState } from 'react'
import type { MemoryContent, MemoryDiagnostics, MemoryDocument, MemoryEntry, MemoryPage, MemoryScope, MemorySearchResult, MemoryVersion } from '@lyyzka/lingxios'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { userFacingError } from '@/lib/userFacingError'
import { memoryApi } from '../runtime/memory-api'
import type { AgentRunTarget } from '../runtime/harness-api'

const scopeLabel: Record<string,string> = { learner: '我的学习记忆',course: '会话记忆',agent_role: '助手角色记忆' }
const emptyContent: MemoryContent = { path: '',title: '',description: '',body: '',layer: 'reference',locked: false }
const selectClass = 'h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function MemoryManager({ target }: { target: AgentRunTarget }) {
  const [open,setOpen]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState(''), [notice,setNotice]=useState('')
  const [scopes,setScopes]=useState<MemoryScope[]>([]), [scope,setScope]=useState<MemoryScope>()
  const [page,setPage]=useState<MemoryPage<MemoryEntry>>({ items: [],nextCursor: null })
  const [document,setDocument]=useState<MemoryDocument>(), [draft,setDraft]=useState<MemoryContent>()
  const [history,setHistory]=useState<MemoryPage<MemoryVersion>>(), [diagnostics,setDiagnostics]=useState<MemoryDiagnostics>()
  const [search,setSearch]=useState(''), [searchTarget,setSearchTarget]=useState<'documents'|'history'>('documents'), [results,setResults]=useState<MemorySearchResult>()
  const [confirmation,setConfirmation]=useState('')
  const [evolution,setEvolution]=useState<Record<string,unknown>[]>(), [rollbackTargets,setRollbackTargets]=useState<Record<string,string>>({})
  async function perform(action: ()=>Promise<void>) {
    if (busy) return
    setBusy(true);setError('');setNotice('')
    try { await action() } catch(cause) { setError(userFacingError(cause,'记忆操作失败，请刷新后核对版本再重试')) }
    finally { setBusy(false) }
  }
  async function load(selected: MemoryScope,cursor?: string) {
    const next=await memoryApi.list(target,selected,{ includeInactive: true,limit: 30,cursor })
    setScope(selected);setPage(current=>cursor ? { ...next,items: [...current.items,...next.items] } : next)
    if (!cursor) { setDocument(undefined);setDraft(undefined);setHistory(undefined);setDiagnostics(undefined);setResults(undefined);setEvolution(undefined);setRollbackTargets({});setConfirmation('') }
  }
  async function read(id: string) {
    if (!scope) return
    const next=await memoryApi.read(target,scope,id)
    setDocument(next);setDraft({ path: next.path,title: next.title,description: next.description,body: next.body,
      layer: next.layer,kind: next.kind,locked: next.locked,validUntil: next.validUntil });setHistory(undefined)
  }
  return <>
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>{ setOpen(true);void perform(async()=>{
      const available=await memoryApi.scopes(target);setScopes(available)
      if (available[0]) await load(available[0]);else { setScope(undefined);setPage({ items: [],nextCursor: null }) }
    }) }}>管理记忆</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>记忆管理</DialogTitle><DialogDescription>仅显示当前任务身份可访问的记忆。保存代表你明确确认该内容；版本变化时请重新读取。</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-1 text-sm">记忆范围
          <select className={selectClass} disabled={busy || !scopes.length} value={scope?.scopeId ?? ''}
            onChange={event=>{ const selected=scopes.find(item=>item.scopeId===event.target.value);if(selected) void perform(()=>load(selected)) }}>
            {scopes.map(item=><option key={`${item.scopeType}:${item.scopeId}`} value={item.scopeId}>{scopeLabel[item.scopeType] ?? item.scopeType}</option>)}
          </select>
        </label>
        <Button type="button" variant="outline" disabled={busy || !scope} onClick={()=>scope && void perform(()=>load(scope))}>刷新</Button>
        <Button type="button" disabled={busy || !scope} onClick={()=>{ setDocument(undefined);setDraft({ ...emptyContent });setHistory(undefined) }}>新建记忆</Button>
      </div>
      {!busy && !scopes.length && <p className="text-sm text-muted-foreground">当前任务没有可管理的记忆范围。</p>}
      {scope && <>
        <form className="flex flex-wrap gap-2" onSubmit={event=>{ event.preventDefault();if(search.trim()) void perform(async()=>setResults(await memoryApi.search(target,scope,{ query: search,target: searchTarget,limit: 20 }))) }}>
          <Input aria-label="搜索记忆" className="min-w-0 flex-1" maxLength={4000} value={search} onChange={event=>setSearch(event.target.value)} />
          <select aria-label="搜索范围" className={selectClass} value={searchTarget} onChange={event=>setSearchTarget(event.target.value as typeof searchTarget)}>
            <option value="documents">记忆文档</option><option value="history">交互历史</option>
          </select>
          <Button type="submit" variant="outline" disabled={busy || !search.trim()}>搜索</Button>
        </form>
        {results && <section aria-label="搜索结果" className="grid gap-2 rounded border p-3 text-sm">
          {results.items.length===0 && <p>没有找到结果。</p>}
          {results.items.map(item=>'id' in item ? <Button key={item.id} type="button" variant="link" className="h-auto justify-start whitespace-normal text-start" disabled={busy} onClick={()=>void perform(()=>read(item.id))}>{item.title}：{item.excerpt}</Button>
            : <p key={`${item.sourceRunId}:${item.requestVersion}:${item.role}`} className="whitespace-pre-wrap break-words">{item.role==='user' ? '用户' : '助手'}：{item.text}{item.truncated ? '（节选）' : ''}</p>)}
          {results.nextCursor && <Button type="button" variant="outline" disabled={busy} onClick={()=>void perform(async()=>{
            const next=await memoryApi.search(target,scope,{ query: search,target: searchTarget,limit: 20,cursor: results.nextCursor! });setResults({ ...next,items: [...results.items,...next.items] })
          })}>更多搜索结果</Button>}
        </section>}
        <ul className="grid gap-2" aria-label="记忆文档">{page.items.map(item=><li key={item.id} className="flex min-w-0 items-center gap-2 rounded border p-2">
          <Button type="button" variant="link" className="h-auto min-w-0 flex-1 justify-start whitespace-normal break-words text-start" disabled={busy} onClick={()=>void perform(()=>read(item.id))}>{item.title}</Button>
          <span className="text-xs text-muted-foreground">v{item.version} · {item.locked ? '受保护' : item.layer==='core' ? '核心' : '参考'}{item.status!=='active' ? ' · 非活跃' : ''}</span>
        </li>)}</ul>
        {page.nextCursor && <Button type="button" variant="outline" disabled={busy} onClick={()=>void perform(()=>load(scope,page.nextCursor!))}>更多记忆</Button>}
        {!page.items.length && !busy && <p className="text-sm text-muted-foreground">此范围暂无记忆文档。</p>}
        {draft && <form className="grid gap-3 rounded border p-3" onSubmit={event=>{ event.preventDefault();void perform(async()=>{
          await memoryApi.apply(target,{ scope,changes: [document ? { action: 'update',id: document.id,expectedVersion: document.version,content: draft } : { action: 'create',content: draft }],idempotencyKey: crypto.randomUUID(),sourceRef: 'memory-manager' })
          await load(scope);setNotice('记忆已保存。')
        }) }}>
          <p className="font-medium">{document ? `编辑记忆 · v${document.version}` : '新建记忆'}</p>
          <label className="grid gap-1 text-sm">路径<Input required maxLength={1000} value={draft.path} placeholder="notes/learning.md" onChange={event=>setDraft({ ...draft,path: event.target.value })} /></label>
          <label className="grid gap-1 text-sm">标题<Input required maxLength={200} value={draft.title} onChange={event=>setDraft({ ...draft,title: event.target.value })} /></label>
          <label className="grid gap-1 text-sm">摘要<Input required maxLength={500} value={draft.description} onChange={event=>setDraft({ ...draft,description: event.target.value })} /></label>
          <label className="grid gap-1 text-sm">内容<Textarea required maxLength={64*1024} className="min-h-40" value={draft.body} onChange={event=>setDraft({ ...draft,body: event.target.value })} /></label>
          <label className="grid gap-1 text-sm">层级<select className={selectClass} value={draft.layer} onChange={event=>setDraft({ ...draft,layer: event.target.value as MemoryContent['layer'] })}><option value="reference">参考记忆</option><option value="core">核心记忆</option></select></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.locked===true} onChange={event=>setDraft({ ...draft,locked: event.target.checked })} />保护内容，仅允许明确确认的修改</label>
          <Button type="submit" disabled={busy}>确认并保存</Button>
          {document && <>
            <Button type="button" variant="outline" disabled={busy} onClick={()=>void perform(async()=>setHistory(await memoryApi.history(target,scope,document.id)))}>查看版本历史</Button>
            <details className="text-xs"><summary>来源</summary>{document.sources.map((source,index)=><p key={`${source.sourceRef}:${index}`} className="mt-1 break-all">{source.sourceRef} · {source.observedAt ?? '时间未记录'}</p>)}</details>
          </>}
        </form>}
        {history && document && <section aria-label="版本历史" className="grid gap-2 rounded border p-3">
          {history.items.map(item=><details key={item.version}><summary className="cursor-pointer text-sm">版本 {item.version} · {item.snapshot.title}</summary>
            <p className="my-2 whitespace-pre-wrap break-words text-sm">{item.snapshot.body}</p>
            <Button type="button" variant="outline" disabled={busy || item.version===document.version} onClick={()=>void perform(async()=>{
              await memoryApi.restore(target,{ scope,id: document.id,expectedVersion: document.version,version: item.version,idempotencyKey: crypto.randomUUID(),sourceRef: 'memory-manager' });await load(scope);setNotice('已恢复所选版本。')
            })}>确认恢复此版本</Button>
          </details>)}
          {history.nextCursor && <Button type="button" variant="outline" disabled={busy} onClick={()=>void perform(async()=>{ const next=await memoryApi.history(target,scope,document.id,history.nextCursor!);setHistory({ ...next,items: [...history.items,...next.items] }) })}>更早版本</Button>}
        </section>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={()=>void perform(async()=>{ const result=await memoryApi.reflect(target,scope);setNotice(`已安排 ${result.jobIds.length} 个反思任务。`) })}>安排记忆反思</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={()=>void perform(async()=>setDiagnostics(await memoryApi.doctor(target,scope)))}>诊断记忆</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={()=>void perform(async()=>setEvolution(await memoryApi.evolution(target,scope)))}>演化评测与回滚</Button>
        </div>
        {evolution && <section aria-label="演化评测与回滚" className="grid gap-2 rounded border p-3 text-sm">
          {!evolution.length && <p>此范围暂无演化评测记录。</p>}
          {evolution.map(item=><details key={String(item.id)}><summary className="cursor-pointer">{String(item.kind)} · {String(item.verdict ?? item.evaluation_status ?? '待评测')} · v{String(item.version)}</summary>
            <p className="my-2 whitespace-pre-wrap break-words">{String(item.body ?? '')}</p>
            <p>评测基准：{String(item.benchmark_id ?? '')}</p>
            {item.status==='active' && typeof item.id==='string' && typeof item.version==='number' && <div className="mt-2 flex flex-wrap gap-2">
              <select className={selectClass} aria-label="回滚目标" disabled={busy} value={rollbackTargets[item.id] ?? ''} onChange={event=>setRollbackTargets({ ...rollbackTargets,[String(item.id)]: event.target.value })}>
                <option value="">停用当前演化</option>
                {evolution.filter(other=>other.status==='retired' && other.verdict==='passed' && other.kind===item.kind).map(other=><option key={String(other.id)} value={String(other.id)}>恢复 {String(other.id)}</option>)}
              </select>
              <Button type="button" variant="outline" disabled={busy} onClick={()=>void perform(async()=>{ await memoryApi.rollbackEvolution(target,scope,String(item.id),Number(item.version),rollbackTargets[String(item.id)] || null);await load(scope);setNotice('演化已回滚。') })}>确认回滚</Button>
            </div>}
          </details>)}
        </section>}
        {diagnostics && <section aria-label="记忆诊断" className="rounded border p-3 text-sm">
          <p>核心内容 {diagnostics.coreBytes} 字节 · 预算 {diagnostics.budgetTokens} tokens{diagnostics.overBudget ? ' · 已超出预算' : ''}</p>
          <p>重复组 {diagnostics.duplicates.length} · 失效链接 {diagnostics.brokenLinks.length} · 过期记忆 {diagnostics.expired.length} · 冲突 {diagnostics.conflicts.length} · 失败反思 {diagnostics.failedReflections.length}</p>
          {diagnostics.brokenLinks.map(item=><p key={`${item.path}:${item.target}`} className="break-all">{item.path} → {item.target}</p>)}
          {diagnostics.conflicts.map(item=><p key={item.id}>{item.reason}</p>)}
          {diagnostics.nextCursor && <Button type="button" variant="outline" disabled={busy} onClick={()=>void perform(async()=>setDiagnostics(await memoryApi.doctor(target,scope,diagnostics.nextCursor!)))}>下一页诊断</Button>}
        </section>}
        <details className="rounded border border-destructive/40 p-3 text-sm"><summary className="cursor-pointer">遗忘此范围的全部记忆</summary>
          <p className="my-2">此操作会清空当前范围并阻止旧任务重新写回。输入“遗忘”后确认。</p>
          <Input aria-label="输入遗忘确认" value={confirmation} onChange={event=>setConfirmation(event.target.value)} />
          <Button type="button" variant="destructive" className="mt-2" disabled={busy || confirmation!=='遗忘'} onClick={()=>void perform(async()=>{ await memoryApi.forget(target,scope);await load(scope);setNotice('此范围已遗忘。') })}>确认遗忘</Button>
        </details>
      </>}
    </DialogContent></Dialog>
  </>
}
