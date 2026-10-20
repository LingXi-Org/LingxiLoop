import { equalContent } from '@/features/content-editor/document'
import { ForumBody } from '../forum/ForumBody'
import { ConversationReferencePicker } from '../forum/ConversationReferences'
import type { ConversationReference } from '../forum/contracts'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useConversations } from '@/features/conversations/store'
import { userFacingError } from '@/lib/userFacingError'
import { useApp } from '@/stores/app'
import type { LearningSpace } from '../contracts'
import { contentLinks, ForumContentFields, ForumFiles } from '../forum/ForumContentFields'
import { contentDraftSchema, useForumDraft } from '../forum/useForumDraft'
import { homeworkApi } from './api'
import { type Homework, homeworkStatus, type HomeworkStudent as StudentState } from './contracts'
import { HomeworkCriteria, HomeworkReport, HomeworkSubmissionView } from './HomeworkReport'

export function HomeworkStudent({ homework, student, space, onUpdated, onSubmitted, onUploading, onRefresh }: {
  homework: Homework; student: StudentState; space: LearningSpace
  onUpdated(value: StudentState): void; onSubmitted(): Promise<void>; onUploading(value: boolean): void; onRefresh(): Promise<void>
}) {
  const { draft, setDraft, storageError, discard } = useForumDraft(`homework:${homework.courseId}:${homework.id}`, contentDraftSchema,
    { body: student.answer.text, editorDocument:student.answer.editorDocument, links: student.answer.links.join('\n'), attachments: student.answer.attachments }, space.canSubmit && student.status !== 'PASSED')
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [references,setReferences]=useState<ConversationReference[]>([])
  const [preview, setPreview] = useState(false)
  const pending = useRef<{ reportId: string; key: string } | null>(null)
  const inFlight = useRef(false)
  const answer = { text: draft.body, editorDocument:draft.editorDocument, links: contentLinks(draft.links), attachments: draft.attachments }
  const dirty = !equalContent(answer, student.answer)
  const disabled = busy || uploading || !space.canSubmit
  const report = !dirty && student.reportStatus === 'READY' && student.report?.answerRevision === student.answerRevision ? student.report : null
  const editable = student.status !== 'PASSED'
  const canSubmit = student.canSubmit && Boolean(report) && !dirty && editable && references.length>0
  const act = async (work: () => Promise<void>) => {
    if (inFlight.current || disabled) return
    inFlight.current = true; setBusy(true); setError(''); setNotice('')
    try { await work() }
    catch (reason) { setError(userFacingError(reason, '操作未完成，草稿仍会保留，请重试。')) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <div className="space-y-6">
    <section aria-label="我的学习进度" className="space-y-3">
      <div className="flex items-center gap-3 text-sm"><h3 className="font-medium">我的学习进度</h3><span className="text-muted-foreground">{homeworkStatus[student.status]}</span></div>
      {student.feedback && <div role="status" className="space-y-2 border-s-2 ps-3 text-sm"><p>教师意见</p><ForumBody content={student.feedback} document={student.feedbackDocument}/><ForumFiles attachments={student.feedbackAttachments ?? []} links={student.feedbackLinks ?? []}/></div>}
      {homework.status === 'CLOSED' && <p role="status" className="text-sm text-muted-foreground">{student.status === 'RETURNED' ? '作业已关闭。你可以根据退回意见修订作答，更新报告后补交一次。已有学习记录仍然有效。' : '作业已关闭，仍可继续学习和查看记录，暂不接收提交。'}</p>}
      {student.status === 'PASSED' ? <p className="text-sm text-muted-foreground">作业已通过。</p> : <p className="text-sm text-muted-foreground">{student.hasLearningRecord ? '保存作答后自动生成学习报告。' : '先与助手讨论作业，再保存作答生成报告。'}</p>}
      {student.criteria.length>0 && <details><summary className="cursor-pointer text-sm text-muted-foreground focus-visible:outline-2">查看学习进度</summary><HomeworkCriteria criteria={student.criteria} /></details>}
      <Button variant="outline" disabled={disabled} onClick={() => void act(async () => {
        if (dirty && editable) {
          const next = await homeworkApi.saveAnswer(homework.courseId, homework.id, { ...answer, expectedRevision: student.answerRevision })
          discard(); onUpdated(next)
        }
        const thread = await homeworkApi.thread(homework.courseId, homework.id)
        await useConversations.getState().reload()
        if (useConversations.getState().projectId !== space.projectId || !useConversations.getState().list.some(item => item.id === thread.channelId)) throw new Error('404')
        useApp.getState().selectConversation(thread.channelId)
      })}>{student.channelId ? '继续学习' : '开始学习'}</Button>
    </section>
    {error && <p role="alert" className="text-sm text-destructive">{error}<Button variant="link" disabled={disabled} onClick={() => void act(onRefresh)}>刷新进度</Button></p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {editable && <p className="text-xs text-muted-foreground">提交时请引用学习报告中作为依据的对话片段，便于教师核对。</p>}
    {editable && <ConversationReferencePicker courseId={homework.courseId} channelId={student.channelId} value={references} onChange={setReferences} disabled={disabled}/>}
    {editable && (preview && report ? <section aria-label="提交预览" className="space-y-5 rounded-xl border p-4">
      <h3 className="font-semibold">提交预览</h3><p className="text-sm text-muted-foreground">以下作答和学习报告将一起提交，仅你和本课程教师可见。</p>
      <ForumBody content={answer.text} document={answer.editorDocument} /><ForumFiles links={answer.links} attachments={answer.attachments} /><HomeworkReport report={report} />
      <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-popover py-3">
        <Button variant="outline" disabled={disabled} onClick={() => setPreview(false)}>返回修改</Button>
        <Button disabled={disabled || !canSubmit} onClick={() => void act(async () => {
          if (!report || !canSubmit) return
          if (pending.current?.reportId !== report.id) pending.current = { reportId: report.id, key: crypto.randomUUID() }
          await homeworkApi.submit(homework.courseId, homework.id, { expectedAnswerRevision: student.answerRevision, reportId: report.id, idempotencyKey: pending.current.key, conversationReferences:references })
          setPreview(false); discard(); setNotice('作答和报告已一起提交，等待教师验收。'); await onSubmitted()
        })}>{busy ? '提交中…' : '提交作业'}</Button>
      </div>
    </section> : <section aria-label="我的作答草稿" className="space-y-4">
      <div className="space-y-1"><h3 className="font-semibold">我的作答</h3><p className="text-sm text-muted-foreground">草稿仅自己可见。正式提交后，教师才能看到作答和报告。</p></div>
      <ForumContentFields label="我的作答" body={draft.body} editorDocument={draft.editorDocument} setBody={(body,editorDocument) => setDraft(previous => ({ ...previous, body,editorDocument }))} links={draft.links} setLinks={links => setDraft(previous => ({ ...previous, links }))} attachments={draft.attachments} setAttachments={attachments => setDraft(previous => ({ ...previous, attachments }))} disabled={disabled} onUploading={value => { setUploading(value); onUploading(value) }} />
      <p className="text-xs text-muted-foreground">可核对文字、公开网页、含可提取文字的 PDF 和 Word 文档（.docx）。图片、扫描件、音视频需要补充文字说明；上传完成不代表已被阅读。</p>
      {storageError && <p role="alert" className="text-sm text-destructive">本地草稿无法保存，请先保存到课程或复制内容。</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={disabled || !dirty} onClick={() => void act(async () => {
          const next = await homeworkApi.saveAnswer(homework.courseId, homework.id, { ...answer, expectedRevision: student.answerRevision })
          discard(); onUpdated(next); setNotice(next.reportStatus==='PENDING'?'作答已保存，正在自动生成学习报告。':'草稿已保存，请先完成与助手的对话。')
        })}>保存草稿</Button>
        <Button variant="outline" disabled={disabled || dirty || !student.hasLearningRecord || !student.canSubmit || student.reportStatus === 'PENDING' || !answer.text.trim() && !answer.links.length && !answer.attachments.length} onClick={() => void act(async () => {
          onUpdated(await homeworkApi.report(homework.courseId, homework.id, student.answerRevision)); setNotice('正在更新学习报告。')
        })}>{student.reportStatus === 'PENDING' ? '报告更新中…' : '更新报告'}</Button>
        <Button disabled={disabled || !canSubmit} onClick={() => setPreview(true)}>预览并提交</Button>
      </div>
      {dirty && <div className="space-y-1"><p role="status" className="text-sm text-muted-foreground">本地作答与已保存的草稿不同，请保存并更新报告后再提交。</p><Button variant="link" size="sm" disabled={disabled} onClick={() => { setDraft({ body: student.answer.text, editorDocument:student.answer.editorDocument, links: student.answer.links.join('\n'), attachments: student.answer.attachments }); discard() }}>放弃本地修改，恢复已保存的草稿</Button></div>}
      {student.reportStatus === 'INVALID' && !dirty && <p role="status" className="text-sm text-muted-foreground">{student.reportFeedback || '报告暂未生成，请重试。已保存的作答和学习记录仍会保留。'}</p>}
      {report && <><p className="text-xs text-muted-foreground">报告由你的助手根据学习证据整理。可以继续对话、补充证据来更新报告。</p><HomeworkReport report={report} /></>}
    </section>)}
    {student.manualReview && <section aria-label="已分享的复核证据" className="space-y-3">
      <h3 className="font-semibold">已分享的复核证据</h3>
      {student.manualReview.evidence.map((text, index) => <blockquote key={index} className="whitespace-pre-wrap border-s-2 ps-3 text-sm text-muted-foreground">{text}</blockquote>)}
      <p className="text-sm text-muted-foreground">已于 {new Date(student.manualReview.sharedAt).toLocaleString('zh-CN')} 分享给教师。</p>
    </section>}
    {student.latestSubmission && <details className="space-y-3"><summary className="cursor-pointer text-sm focus-visible:outline-2">最近一次提交</summary><HomeworkSubmissionView submission={student.latestSubmission} /></details>}
  </div>
}
