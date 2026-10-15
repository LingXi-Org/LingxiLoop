import { ConversationReferences } from '../forum/ConversationReferences'
import { Badge } from '@/components/ui/badge'
import { ForumFiles } from '../forum/ForumContentFields'
import { MemoContent } from '../forum/memos/MemoContent'
import { type HomeworkCriterion, type HomeworkSubmission, homeworkStatus, type HomeworkReport as Report } from './contracts'

export function HomeworkCriteria({ criteria, unverified = false }: { criteria: HomeworkCriterion[]; unverified?: boolean }) {
  return <ul className="space-y-3">{criteria.map((item, index) => <li key={index} className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
    <div className="flex flex-wrap items-start gap-2"><span className="min-w-0 flex-1 font-medium">{item.criterion}</span><Badge variant={!unverified && item.met && item.independent ? 'secondary' : 'outline'}>{unverified ? '未核实' : item.met && item.independent ? '已达成' : '待验证'}</Badge></div>
    {item.feedback && <p className="text-muted-foreground">{item.feedback}</p>}
  </li>)}</ul>
}

export function HomeworkReport({ report }: { report: Report }) {
  return <section aria-label="学习报告" className="space-y-4 text-sm">
    <h3 className="text-base font-semibold">学习报告</h3>
    {report.verification === 'unverified' && <p role="status" className="rounded-lg border p-3 text-muted-foreground">本次未能核实学习情况。报告保留了真实学习记录，掌握程度和独立完成情况仍待核实。</p>}
    <div className="space-y-1"><h4 className="font-medium">完成情况</h4><p className="whitespace-pre-wrap">{report.completion}</p></div>
    <HomeworkCriteria criteria={report.criteria} unverified={report.verification === 'unverified'} />
    <div className="space-y-1"><h4 className="font-medium">获得的帮助</h4><p className="whitespace-pre-wrap">{report.assistance}</p></div>
    <div className="space-y-1"><h4 className="font-medium">独立完成情况</h4><p className="whitespace-pre-wrap">{report.independence}</p></div>
    <div className="space-y-1"><h4 className="font-medium">{report.verification === 'unverified' ? '仍待核实' : '仍需巩固'}</h4>{report.weaknesses.length ? <ul className="list-disc space-y-1 ps-5">{report.weaknesses.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p className="text-muted-foreground">本次报告没有列出待巩固内容。</p>}</div>
    <div className="space-y-2"><h4 className="font-medium">相关证据摘要</h4>{report.evidence.map((text, index) => <blockquote key={index} className="whitespace-pre-wrap border-s-2 ps-3 text-muted-foreground">{text}</blockquote>)}</div>
    {report.manualReview && <div className="space-y-2 rounded-lg border p-3"><h4 className="font-medium">教师人工复核</h4><p>{report.manualReview.reason}</p>{report.manualReview.remainingDoubts.length > 0 && <><p className="text-muted-foreground">助手仍有以下疑问：</p><ul className="list-disc space-y-1 ps-5">{report.manualReview.remainingDoubts.map((text, index) => <li key={index}>{text}</li>)}</ul></>}</div>}
  </section>
}

export function HomeworkSubmissionView({ submission }: { submission: HomeworkSubmission }) {
  return <article aria-label={`${submission.learnerName}第 ${submission.version} 次提交`} className="space-y-4 rounded-lg border p-4">
    <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">第 {submission.version} 次提交</span><Badge variant="secondary">{homeworkStatus[submission.reviewStatus]}</Badge>{submission.late && <Badge variant="outline">迟交</Badge>}<time className="text-xs text-muted-foreground" dateTime={submission.submittedAt}>{new Date(submission.submittedAt).toLocaleString('zh-CN')}</time></div>
    <section aria-label="提交的作答" className="space-y-3"><h3 className="font-medium">作答</h3><MemoContent content={submission.answer.text} /><ForumFiles links={submission.answer.links} attachments={submission.answer.attachments} /></section>
    <HomeworkReport report={submission.report} />
    <ConversationReferences references={submission.conversationReferences} id={submission.id}/><p className="text-xs text-muted-foreground">学习评价供教师参考，不等同于正式成绩。</p>
    {submission.feedback && <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">教师意见：{submission.feedback}</p>}
  </article>
}
