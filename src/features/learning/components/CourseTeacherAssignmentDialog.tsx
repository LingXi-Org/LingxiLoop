import { useEffect, useId, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { userFacingError } from '@/lib/userFacingError'

export interface CourseTeacherOption { id: string; label: string }

/** Callers bind this mounted form to one course or teacher and verify membership after writing. */
export function CourseTeacherAssignmentDialog({ title, description, choiceLabel, loadOptions, assign, onClose }: {
  title: string; description: string; choiceLabel: string
  loadOptions: () => Promise<CourseTeacherOption[]>
  assign: (id: string, idempotencyKey: string) => Promise<void>
  onClose: () => void
}) {
  const labelId = useId(), [options, setOptions] = useState<CourseTeacherOption[]>([])
  const [selection, setSelection] = useState(''), [query, setQuery] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [loading, setLoading] = useState(true), [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let active = true
    setLoading(true); setLoaded(false); setError(''); setSelection('')
    void loadOptions().then(rows => { if (active) { setOptions(rows); setLoaded(true) } })
      .catch(reason => { if (active) setError(userFacingError(reason, '可选成员或课程暂时无法加载，请重试。')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadOptions, revision])
  const selected = options.find(option => option.id === selection)
  const visible = options.filter(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || loading || !loaded || !selected) return
    setBusy(true); setError('')
    try { await assign(selected.id, idempotencyKey); if (mounted.current) onClose() }
    catch (reason) { if (mounted.current) setError(userFacingError(reason, '课程授权未确认，请重试；不会重复创建成员。')) }
    finally { if (mounted.current) setBusy(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent aria-busy={loading || busy}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted-foreground">仅授予所选课程的教师权限，可在该课程发布作业；其他课程不受影响。</p>
        {loading && <p role="status">正在加载可选范围…</p>}
        {loaded && <><label className="block space-y-2">搜索{choiceLabel}<Input value={query} onChange={event => { setQuery(event.target.value); setSelection('') }} disabled={busy} /></label>
          <div className="space-y-2"><label id={labelId}>{choiceLabel}</label><Select value={selection} disabled={busy || !options.length} onValueChange={value => { setSelection(value); setIdempotencyKey(crypto.randomUUID()) }}>
            <SelectTrigger aria-labelledby={labelId} className="w-full"><SelectValue placeholder={`请选择${choiceLabel}`} /></SelectTrigger>
            <SelectContent>{visible.map(option => <SelectItem value={option.id} key={option.id}>{option.label}</SelectItem>)}</SelectContent>
          </Select></div>
          {!options.length && <p role="status">没有可添加的选项，请确认教师已加入本公司且目标课程可管理。</p>}
          {options.length > 0 && !visible.length && <p role="status">没有匹配的选项。</p>}
        </>}
        {error && <Alert variant="destructive"><AlertDescription>{error}{!loaded && <Button type="button" variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}>重试加载</Button>}</AlertDescription></Alert>}
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" disabled={busy || loading || !loaded || !selected}>{busy ? '正在确认课程授权…' : '确认加入本课程'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
