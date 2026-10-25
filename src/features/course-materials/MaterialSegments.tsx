import { useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { TextViewer, type TextViewerHandle } from '@/components/retab/ui/text-viewer'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/stores/auth'
import { userFacingError } from '@/lib/userFacingError'
import { knowledgeApi } from '../knowledge/api'
import type { KnowledgeSource } from '../knowledge/contracts'
import { type MaterialContext, materialQueryKey } from './data'
import { materialsQueryClient } from './queries'
import { MaterialEvidenceList } from './MaterialEvidenceList'
import { evidenceLineRange, type MaterialEvidence } from './segment-evidence'

/** Mount only in the lazily activated semantic mode; scoped remounts discard old evidence. */
export default function MaterialSegments({ source, context }: { source: KnowledgeSource; context: MaterialContext }) {
  const scope = JSON.stringify([...materialQueryKey(context), source.id, source.updatedAt, source.status])
  return <ScopedMaterialSegments key={scope} source={source} context={context} />
}

function ScopedMaterialSegments({ source, context }: { source: KnowledgeSource; context: MaterialContext }) {
  const inputId = useId()
  const viewer = useRef<TextViewerHandle>(null)
  const [query, setQuery] = useState('')
  const [request, setRequest] = useState<{ query: string; indexVersion?: string; attempt: number } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const current = useAuth(state => state.user?.id === context.userId && state.activeCompanyId === context.companyId)
  const search = useQuery({
    queryKey: [...materialQueryKey(context), 'semantic', source.id, source.updatedAt, request],
    enabled: current && source.status === 'ready' && !!request,
    queryFn: async ({ signal }) => {
      const response = await knowledgeApi.searchProjectSource(context.projectId, source.id, {
        query: request!.query, ...(request!.indexVersion ? { indexVersion: request!.indexVersion } : {}),
      }, signal)
      signal.throwIfAborted()
      if (useAuth.getState().user?.id !== context.userId || useAuth.getState().activeCompanyId !== context.companyId) throw new Error('资料访问状态已改变。')
      return response
    },
  }, materialsQueryClient)
  const result = search.data?.sourceId === source.id ? search.data : undefined
  const text = result?.extractedText ?? ''
  const textSource = useMemo(() => ({ kind: 'text' as const, text, fileName: `${source.title}.txt`,
    identityKey: `${source.id}:${result?.indexVersion ?? ''}` }), [text, source.title, source.id, result?.indexVersion])
  const matches = result?.status === 'matched' && result.indexVersion ? result.matches : []
  const active = matches.find(match => match.chunkId === (previewId ?? selectedId))
  const highlight = active ? evidenceLineRange(text, active) : null
  function select(match: MaterialEvidence) {
    setSelectedId(match.chunkId)
    const range = evidenceLineRange(text, match)
    if (range) viewer.current?.scrollToLineRange(range, { behavior: 'auto' })
  }
  function submit(refresh = false) {
    const value = refresh ? request?.query : query.trim()
    if (!value) return
    setSelectedId(null); setPreviewId(null)
    setRequest({ query: value, ...(refresh || !result?.indexVersion ? {} : { indexVersion: result.indexVersion }), attempt: (request?.attempt ?? 0) + 1 })
  }
  if (!current) return null
  if (source.status !== 'ready') return <p className="p-4 text-sm text-muted-foreground">{['queued', 'processing'].includes(source.status)
    ? '资料正在建立索引，请稍后再查找片段。' : '此资料暂无可检索的知识片段，可切换到原文件查看。'}</p>
  return <section aria-label="资料语义检索" className="min-w-0 space-y-4">
    <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); submit() }}>
      <div className="min-w-48 flex-1"><label htmlFor={inputId} className="mb-2 block text-sm font-medium">查找资料中的概念</label>
        <Input id={inputId} value={query} maxLength={4000} placeholder="例如：注意力机制如何工作" onChange={event => setQuery(event.target.value)} /></div>
      <Button type="submit" disabled={!query.trim() || search.isFetching}><Search aria-hidden="true" />{search.isFetching ? '正在查找…' : '查找片段'}</Button>
    </form>
    <p className="text-xs leading-6 text-muted-foreground">命中片段可定位到解析文本中的对应行；原文件页码和区域暂不可用。</p>
    <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
      {search.isFetching ? '正在检索资料，请稍候。' : !request ? '输入一个概念，查看资料中的相关片段。'
        : result?.status === 'matched' ? `找到 ${matches.length} 个片段。`
          : result?.status === 'no_matches' ? '没有找到相关片段，可换一个概念再试。'
            : result?.status === 'processing' ? '资料正在建立索引，请稍后再试。'
              : result?.status === 'not_indexed' ? '此资料暂无可检索的知识片段。' : null}
    </div>
    {search.isError && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">{userFacingError(search.error, '暂时无法检索资料。')}<Button variant="outline" onClick={() => submit(true)}>重试</Button></AlertDescription></Alert>}
    {result?.status === 'stale' && <Alert><AlertDescription className="flex flex-wrap items-center gap-3">资料索引已变化，请刷新片段后继续查看。<Button variant="outline" onClick={() => submit(true)}>刷新片段</Button></AlertDescription></Alert>}
    {!!matches.length && <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(14rem,1fr)_minmax(0,2fr)]">
      <aside className="min-w-0 max-h-[54dvh] overflow-y-auto rounded-xl border p-2" aria-label="语义命中来源">
        <MaterialEvidenceList matches={matches} selectedId={selectedId} previewId={previewId}
          hasPosition={match => !!evidenceLineRange(text, match)} onSelect={select} onPreview={setPreviewId} />
      </aside>
      <div className="min-w-0 space-y-3">
        <h3 className="text-sm font-medium">解析文本定位</h3>
        {active && !highlight && <div className="rounded-lg border p-4"><p className="mb-2 text-xs text-muted-foreground">此片段暂无可核实的位置，以下为资料摘录。</p><blockquote className="whitespace-pre-wrap break-words text-sm leading-7">{active.excerpt}</blockquote></div>}
        <div role="region" aria-label="资料解析文本" className="min-w-0"
          onPointerOver={event => {
            const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-source-line]') : null
            const line = Number(element?.dataset.sourceLine)
            const match = matches.find(item => { const range = evidenceLineRange(text, item); return range && line >= range.start && line <= range.end })
            setPreviewId(match?.chunkId ?? null)
          }} onPointerLeave={() => setPreviewId(null)}>
          <TextViewer ref={viewer} source={textSource} mode="text" controls={false} download={false} highlight={highlight}
            className="h-[54dvh] min-h-64 overflow-hidden rounded-lg border" />
        </div>
      </div>
    </div>}
  </section>
}
