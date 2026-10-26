import type { ConversationReference } from '../forum/contracts'
import type { HomeworkAnswer, HomeworkStudent } from './contracts'

/** Explain the same prerequisites used by preview and final submit, in action order. */
export function homeworkSubmissionBlocker({ student, answer, dirty, uploading, references, canSubmit }: {
  student: HomeworkStudent; answer: HomeworkAnswer; dirty: boolean; uploading: boolean
  references: ConversationReference[]; canSubmit: boolean
}): string {
  if (!canSubmit) return '你目前无法提交这份作业。'
  if (!student.canSubmit) return '作业暂不接收提交，请查看上方学习进度。'
  if (uploading) return '附件正在上传，请等待上传完成。'
  if (!answer.text.trim() && !answer.links.length && !answer.attachments.length) return '请先填写作答，或添加链接、附件，再保存草稿。'
  if (dirty) return '请先保存最新作答并更新学习报告，再预览提交。'
  if (!student.hasLearningRecord) return '请先进入本作业的学习对话，完成本人作答和助手回复，再更新报告。'
  if (student.reportStatus === 'PENDING') return '学习报告正在生成，完成后可预览提交。'
  if (student.reportStatus !== 'READY' || !student.report || student.report.answerRevision !== student.answerRevision) return '请先点击“更新报告”，为当前作答生成学习报告。'
  if (!references.length) return '请先选择学习对话，并勾选至少一段本人作答和助手回复。'
  if (student.report.evidenceSources?.some(source => !references.some(ref => ref.channelId === student.channelId && ref.messageIds.includes(source.messageId)))) {
    return '请选择包含学习报告依据的对话片段，再预览提交。'
  }
  return ''
}

export interface HomeworkSubmissionAttempt { fingerprint: string; key: string }

/** Reuse the key for an unchanged retry; corrected evidence is a new request. */
export function homeworkSubmissionAttempt(previous: HomeworkSubmissionAttempt | null, reportId: string, answerRevision: number, references: ConversationReference[]): HomeworkSubmissionAttempt {
  const fingerprint = JSON.stringify({ reportId, answerRevision, references })
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, key: crypto.randomUUID() }
}
