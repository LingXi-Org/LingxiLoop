import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { HomeworkValidationFinding } from './contracts'

const labels = { blocker: '需要修改', suggestion: '可选建议', teacher_review: '需要教师复核' }

function Suggestion({ finding, current, busy, onApply }: {
  finding: HomeworkValidationFinding; current: string | undefined; busy: boolean
  onApply(finding: HomeworkValidationFinding, replacement: string): void
}) {
  const id = useId()
  const [replacement, setReplacement] = useState(finding.replacement ?? '')
  const [retained, setRetained] = useState(false)
  const changed = finding.criterionIndex !== null && current !== finding.original
  return <li className="space-y-2 rounded-md border p-3 text-sm">
    <p className="font-medium">{labels[finding.severity]} · {finding.criterionIndex === null ? finding.field === 'instructions' ? '作业正文' : '作业标题' : `验收标准第 ${finding.criterionIndex + 1} 条`}</p>
    <p className="whitespace-pre-wrap">原文：{finding.original}</p>
    <p>{finding.reason}</p><p>建议：{finding.suggestion}</p>
    {finding.observableEvidence && <p>学生需提供：{finding.observableEvidence}</p>}
    {finding.teacherReview && <p>教师判断：{finding.teacherReview}</p>}
    {finding.instructionChange && <p className="whitespace-pre-wrap">还需同步修改作业正文：{finding.instructionChange}（请在上方正文中编辑）</p>}
    {finding.replacement && !changed && !retained && <>
      <Label htmlFor={id}>替代标准（可编辑）</Label>
      <Textarea id={id} value={replacement} maxLength={2000} disabled={busy} onChange={event => setReplacement(event.target.value)} />
      <Button type="button" variant="outline" disabled={busy || !replacement.trim() || replacement.trim() === finding.original} onClick={() => onApply(finding, replacement)}>将此条填入编辑器</Button>
    </>}
    {!changed && <Button type="button" variant="ghost" disabled={busy} onClick={() => setRetained(!retained)}>{retained ? '重新查看建议' : '保留原稿'}</Button>}
    {retained && <p role="status">已保留原稿。{finding.severity === 'blocker' ? '此项仍需解决后才能发布。' : finding.severity === 'teacher_review' ? '发布时需确认由教师复核。' : '可继续确认发布。'}</p>}
    {changed && <p role="status">此条已编辑，请保存并重新检查；原检查结果不会用于发布。</p>}
  </li>
}

export function HomeworkSuggestions({ findings, criteria, busy, onApply }: {
  findings: HomeworkValidationFinding[]; criteria: string[]; busy: boolean
  onApply(finding: HomeworkValidationFinding, replacement: string): void
}) {
  if (!findings.length) return null
  return <section aria-label="逐项检查与建议" className="space-y-2">
    <h4 className="font-medium">逐项检查与建议</h4>
    <p className="text-sm text-muted-foreground">建议不会自动覆盖原文。采纳前请核对教学目标，保存后会检查最新内容。</p>
    <ul className="space-y-3">{findings.map((finding, index) => <Suggestion key={index} finding={finding} current={finding.criterionIndex === null ? undefined : criteria[finding.criterionIndex]} busy={busy} onApply={onApply} />)}</ul>
  </section>
}
