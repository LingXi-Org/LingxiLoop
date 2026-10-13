import { useCallback, useEffect, useRef, useState } from 'react'
import { userFacingError } from '@/lib/userFacingError'
import type { LearningSpace } from '../contracts'
import { forumApi } from './api'
import type { ForumAttachment, ForumItem, SubmissionVersion } from './contracts'
import { contentLinks, ForumContentFields, ForumFiles } from './ForumContentFields'
import { MemoCard } from './memos/MemoCard'
import { MemoContent } from './memos/MemoContent'
import { Button, MemoTag } from './memos/MemoControls'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './memos/MemoDialog'

const sourceLabels = { STUDENT_ORIGINAL: '学生原创',AGENT_RELAY: 'Agent 代交',AGENT_GENERATED: 'Agent 生成' }
function Version({ submission }: { submission: SubmissionVersion }) {
  return <MemoCard label={`第 ${submission.version} 版提交`} author={submission.learnerName} createdAt={submission.submittedAt}
    actions={<span className="text-xs text-muted-foreground">第 {submission.version} 版</span>}>
    <div className="flex flex-wrap items-center gap-2"><MemoTag>{sourceLabels[submission.source]}</MemoTag>{submission.late && <MemoTag>迟交</MemoTag>}</div>
    <MemoContent content={submission.answer} />
    <ForumFiles links={submission.links} attachments={submission.attachments} />
    {submission.source === 'AGENT_GENERATED' && <p className="text-xs text-muted-foreground">此版本由 Agent 生成，不计为独立完成的学习证据。</p>}
  </MemoCard>
}

export function ForumSubmission({ space, item, onClose }: { space: LearningSpace; item: ForumItem; onClose(): void }) {
  const [versions, setVersions] = useState<SubmissionVersion[]>([]), [nextOffset, setNextOffset] = useState<number | null>(null)
  const [answer, setAnswer] = useState(''), [links, setLinks] = useState(''), [attachments, setAttachments] = useState<ForumAttachment[]>([])
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  const pending = useRef<{ fingerprint: string; key: string } | null>(null)
  const load = useCallback(async (offset = 0) => {
    setBusy(true); setError('')
    try {
      const history = await forumApi.submissions(space.courseId!,item.id,offset)
      setVersions(previous => offset ? [...previous,...history.items] : history.items)
      setNextOffset(history.nextOffset)
    } catch (reason) { setError(userFacingError(reason, '提交记录加载失败，请重试。')) }
    finally { setBusy(false) }
  }, [space.courseId,item.id])
  useEffect(() => { void load() }, [load])
  const groups = new Map<string, SubmissionVersion[]>()
  for (const version of versions) groups.set(version.learnerId,[...(groups.get(version.learnerId) ?? []),version])
  const disabled = busy || uploading
  return <Dialog open onOpenChange={open => { if (!open && !uploading) onClose() }}><DialogContent>
    <DialogHeader><DialogTitle>{item.title}</DialogTitle><DialogDescription>{space.canReview ? '查看本课程学生的提交与历史版本。' : '提交仅你和本课程教师可见。再次提交会保留旧版本。'}</DialogDescription></DialogHeader>
    <MemoContent content={item.body} />
    {item.dueAt && <p className="text-sm text-muted-foreground">截止时间：{new Date(item.dueAt).toLocaleString()}；截止后仍可提交，将标记为迟交。</p>}
    {item.status === 'CLOSED' ? <p role="status" className="text-sm">作业已关闭，停止接收提交。</p> : space.canSubmit && <form className="space-y-4" onSubmit={async event => {
      event.preventDefault()
      if (disabled || !space.courseId) return
      const content = { answer,links: contentLinks(links),attachments }
      const fingerprint = JSON.stringify(content)
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint,key: crypto.randomUUID() }
      setBusy(true); setError(''); setSaved(false)
      try {
        await forumApi.submit(space.courseId,item.id,{ ...content,idempotencyKey: pending.current.key })
        pending.current = null; setAnswer(''); setLinks(''); setAttachments([]); setSaved(true)
        await load()
      } catch (reason) { setError(userFacingError(reason, '提交失败，请确认作业仍开放后重试。')) }
      finally { setBusy(false) }
    }}>
      <ForumContentFields body={answer} setBody={setAnswer} label="作业内容" links={links} setLinks={setLinks} attachments={attachments} setAttachments={setAttachments} disabled={disabled} onUploading={setUploading} />
      <Button type="submit" disabled={disabled || !answer.trim() && !links.trim() && !attachments.length}>{uploading ? '上传中…' : busy ? '提交中…' : '提交作业'}</Button>
    </form>}
    {saved && <p role="status" className="text-sm">作业已提交</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}<Button variant="link" disabled={disabled} onClick={() => void load()}>重新加载记录</Button></p>}
    <section aria-label="提交记录" className="space-y-4 border-t pt-4"><h3 className="text-sm font-medium">提交记录</h3>
      {!versions.length && !busy && <p className="text-sm text-muted-foreground">还没有提交记录。</p>}
      {[...groups.values()].map(group => <div key={group[0].learnerId} className="space-y-2">{space.canReview && <h4 className="text-sm font-medium">{group[0].learnerName}</h4>}<Version submission={group[0]} />{group.length > 1 && <details><summary className="cursor-pointer rounded-sm text-sm text-muted-foreground focus-visible:outline-2">历史版本（{group.length - 1}）</summary><div className="mt-2 space-y-2">{group.slice(1).map(version => <Version key={version.id} submission={version} />)}</div></details>}</div>)}
      {nextOffset !== null && <Button variant="outline" disabled={busy} onClick={() => void load(nextOffset)}>更多提交记录</Button>}
    </section>
  </DialogContent></Dialog>
}
