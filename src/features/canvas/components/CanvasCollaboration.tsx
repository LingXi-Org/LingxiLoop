import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { userFacingError } from '@/lib/userFacingError'
import { canvasApi, type CanvasCollaboration as Collaboration } from '../api'
import { useCanvas } from '../state'

export function CanvasCollaboration() {
  const canvas = useCanvas(state => state.snapshot)
  const [open,setOpen] = useState(false), [data,setData] = useState<Collaboration | null>(null)
  const [field,setField] = useState(''), [value,setValue] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false)
  const [more,setMore] = useState(true)
  async function load() {
    if (!canvas) return
    setBusy(true); setError('')
    try { setData(await canvasApi.getCollaboration(canvas.id)); setMore(true) }
    catch (cause) { setError(userFacingError(cause,'协作记录读取失败')) }
    finally { setBusy(false) }
  }
  async function loadMore() {
    if (!canvas || !data) return
    setBusy(true); setError('')
    try {
      const next = await canvasApi.getCollaboration(canvas.id,data.history.nextSeq)
      setMore(next.history.items.length > 0)
      setData(current => current ? { ...next,history: { ...next.history,items: [...current.history.items,...next.history.items] } } : next)
    } catch (cause) { setError(userFacingError(cause,'修改历史读取失败')) }
    finally { setBusy(false) }
  }
  async function save(remove = false) {
    if (!canvas || !field.trim()) return
    setBusy(true); setError('')
    try {
      const result = await canvasApi.updateSharedState(canvas.id,{ operationId: crypto.randomUUID(),changes: [{ field: field.trim(),
        expectedVersion: data?.state?.fields[field.trim()]?.version ?? 0,...remove ? { delete: true } : { value } }] })
      setData(current => ({ graphs: current?.graphs ?? [],history: current?.history ?? { items: [],nextSeq: 0 },state: result.state }))
      if (!result.ok) setError(`以下内容已被其他参与者修改：${result.conflicts.join('、')}。请核对新版本后再保存。`)
      else await load()
    } catch (cause) { setError(userFacingError(cause,'共享内容保存失败')) }
    finally { setBusy(false) }
  }
  return <>
    <Button type="button" variant="outline" size="sm" disabled={!canvas} onClick={() => { setOpen(true); void load() }}>协作记录</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>协作记录与共享内容</DialogTitle><DialogDescription>查看自己发起的分支结果，按读取到的版本更新共享内容。</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" variant="outline" disabled={busy} onClick={() => void load()}>刷新</Button>
      {data?.graphs.map(graph => <details key={graph.id} className="rounded border p-3"><summary>分支结果（{graph.nodes.length}）</summary>
        {graph.nodes.map((node,index) => <div key={node.id} className="mt-2 border-t pt-2 text-sm"><p>{canvas?.assignments.find(assignment => assignment.id === node.id)?.assignment ?? `分支 ${index + 1}`}</p><p className="whitespace-pre-wrap">{node.text ?? '等待分支结果'}</p>
          {Boolean(node.error) && <p className="text-destructive">该分支需要处理，请查看任务详情。</p>}</div>)}
      </details>)}
      <ul className="space-y-2">{Object.entries(data?.state?.fields ?? {}).filter(([,entry]) => !entry.deleted).map(([name,entry]) => <li key={name} className="rounded border p-2">
        <Button type="button" variant="link" onClick={() => { setField(name); setValue(typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value)) }}>{name} · 版本 {entry.version}</Button>
        <p className="whitespace-pre-wrap break-words text-sm">{typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value)}</p>
      </li>)}</ul>
      <label className="grid gap-1 text-sm">内容名称<Input value={field} onChange={event => setField(event.target.value)} maxLength={200} /></label>
      <label className="grid gap-1 text-sm">共享内容<Textarea value={value} onChange={event => setValue(event.target.value)} maxLength={10000} /></label>
      <div className="flex gap-2"><Button type="button" disabled={busy || !field.trim()} onClick={() => void save()}>保存</Button>
        <Button type="button" variant="outline" disabled={busy || !data?.state?.fields[field]?.version} onClick={() => void save(true)}>删除</Button></div>
      {data?.history.items.length ? <details><summary className="cursor-pointer">修改历史与来源（{data.history.items.length}）</summary>
        <ul className="mt-2 space-y-2 text-xs">{data.history.items.map(item => {
          const origin = item.origin as { principalId?: string; source?: { messageId: string; version: number } }
          const changes = item.changes as { field: string }[]
          const result = item.result as { ok: boolean }
          return <li key={String(item.seq)} className="rounded border p-2"><p>{result.ok ? '已保存' : '版本冲突'} · {changes.map(change => change.field).join('、')}</p>
            <p>{new Date(String(item.recorded_at)).toLocaleString('zh-CN')}</p>
            {origin.source && <p className="break-all">来源消息：{origin.source.messageId} · 版本 {origin.source.version}</p>}</li>
        })}</ul>{more && <Button type="button" variant="outline" disabled={busy} onClick={() => void loadMore()}>继续加载历史</Button>}</details> : null}
    </DialogContent></Dialog>
  </>
}
