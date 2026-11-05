import { ForumBody } from '../forum/ForumBody'
import type { ConversationEvidence } from '../forum/contracts'
import { findReportSource } from './report-source'
import { ConversationReferences, openEvidenceMessage } from '../forum/ConversationReferences'
import { MemoCard } from '../forum/memos/MemoCard'
import { ForumFiles } from '../forum/ForumContentFields'
import { type HomeworkCriterion, type HomeworkSubmission, homeworkStatus, type HomeworkReport as Report } from './contracts'

export function HomeworkCriteria({ criteria, unverified = false, references = [], sourceId }: { criteria: HomeworkCriterion[]; unverified?: boolean; references?: ConversationEvidence[]; sourceId?: string }) {
  return <ul className="space-y-3">{criteria.map((item, index) => <li key={index} className="space-y-1 border-s-2 ps-3 text-sm">
    <div className="flex flex-wrap items-start gap-2"><span className="min-w-0 flex-1 font-medium">{item.criterion}</span><span className="text-xs text-muted-foreground">{item.reviewRequired ? '待教师判断' : unverified ? '未核实' : item.met && item.independent ? '已达成' : '待验证'}</span></div>
    {item.feedback && <p className="text-muted-foreground">{item.feedback}</p>}
    {item.evidence?.map((source,index)=><div key={index} className="space-y-1"><blockquote className="whitespace-pre-wrap border-s-2 ps-3 text-muted-foreground">{source.excerpt}</blockquote><ReportCitation source={source} references={references} sourceId={sourceId}/></div>)}
    {sourceId&&!item.evidence?.length&&<p className="text-xs text-muted-foreground">此项未记录单独的证据引用，请结合共享片段核对。</p>}
  </li>)}</ul>
}

function ReportCitation({source,references,sourceId}:{source:{messageId:string;excerpt:string};references:ConversationEvidence[];sourceId?:string}) {
  if(!sourceId)return null
  const location=findReportSource(source,references)
  return location ? <a className="underline focus-visible:outline-2" href={`#${sourceId}-message-${source.messageId}`} onClick={event=>{event.preventDefault();openEvidenceMessage(sourceId,location.index,source.messageId)}}>定位原消息 · {source.messageId}</a>
    : <p className="text-xs text-muted-foreground">来源未包含在共享片段中，或引用已失效，无法定位。</p>
}

export function HomeworkReport({ report, references = [], sourceId }: { report: Report; references?: ConversationEvidence[]; sourceId?: string }) {
  return <section aria-label="学习报告" className="space-y-4 text-sm">
    <h3 className="text-base font-semibold">学习报告</h3>
    <p className="text-xs text-muted-foreground">AI 辅助观察，最终评分与验收由教师确定。{report.generatedAt && `生成于 ${new Date(report.generatedAt).toLocaleString()} · 作答版本 ${report.answerRevision} · 作业版本 ${report.homeworkRevision ?? "未知"}`}</p>
    {report.verification === 'unverified' && <p role="status" className="text-muted-foreground">本次未能核实学习情况，掌握程度和独立完成情况仍待核实。</p>}
    <div className="space-y-1"><h4 className="font-medium">完成情况</h4><p className="whitespace-pre-wrap">{report.completion}</p></div>
    <HomeworkCriteria criteria={report.criteria} unverified={report.verification === 'unverified'} references={references} sourceId={sourceId} />
    <div className="space-y-1"><h4 className="font-medium">获得的帮助</h4><p className="whitespace-pre-wrap">{report.assistance}</p>{report.assistanceEvidence?.map(source=><div key={source.messageId} className="space-y-1"><blockquote className="whitespace-pre-wrap border-s-2 ps-3 text-muted-foreground">{source.excerpt}</blockquote><ReportCitation source={source} references={references} sourceId={sourceId}/></div>)}</div>
    <div className="space-y-1"><h4 className="font-medium">独立完成情况</h4><p className="whitespace-pre-wrap">{report.independence}</p></div>
    <div className="space-y-1"><h4 className="font-medium">{report.verification === 'unverified' ? '仍待核实' : '仍需巩固'}</h4>{report.weaknesses.length ? <ul className="list-disc space-y-1 ps-5">{report.weaknesses.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p className="text-muted-foreground">本次报告没有列出待巩固内容。</p>}</div>
    <div className="space-y-2"><h4 className="font-medium">相关证据摘要</h4>{report.evidence.map((text, index) => {
      const source=report.evidenceSources?.[index]
      return <div key={index} className="space-y-1"><blockquote className="whitespace-pre-wrap border-s-2 ps-3 text-muted-foreground">{text}</blockquote>
        {source ? <ReportCitation source={source} references={references} sourceId={sourceId}/> : sourceId && <p className="text-xs text-muted-foreground">旧报告未记录消息来源，无法定位。</p>}</div>
    })}</div>
    {report.manualReview && <div className="space-y-2"><h4 className="font-medium">教师人工复核</h4><p>{report.manualReview.reason}</p>{report.manualReview.remainingDoubts.length > 0 && <><p className="text-muted-foreground">助手仍有以下疑问：</p><ul className="list-disc space-y-1 ps-5">{report.manualReview.remainingDoubts.map((text, index) => <li key={index}>{text}</li>)}</ul></>}</div>}
  </section>
}

export function HomeworkSubmissionView({ submission, framed = true }: { submission: HomeworkSubmission; framed?: boolean }) {
  const content = <div className="w-full space-y-4">
    <p className="text-xs text-muted-foreground">{homeworkStatus[submission.reviewStatus]}{submission.late && ' · 迟交'}</p>
    <section aria-label="提交的作答" className="space-y-3"><h3 className="font-medium">作答</h3><ForumBody purpose="homework" content={submission.answer.text} document={submission.answer.editorDocument} evidence />
    <details><summary className="cursor-pointer text-xs focus-visible:outline-2">核对保存的作答原文</summary><pre className="whitespace-pre-wrap break-words text-sm">{submission.answer.text}</pre><p className="text-xs text-muted-foreground">这是本次提交保存的文本；若原文已缺失符号，请核对原始学习记录并重新保存作答。</p></details><ForumFiles links={submission.answer.links} attachments={submission.answer.attachments} /></section>
    <HomeworkReport report={submission.report} references={submission.conversationReferences} sourceId={submission.id} />
    <ConversationReferences references={submission.conversationReferences} id={submission.id}/><p className="text-xs text-muted-foreground">学习评价供教师参考，不等同于正式成绩。</p>
    {submission.feedback && <div className="space-y-2 border-s-2 ps-3 text-sm"><p>教师意见</p><ForumBody purpose="homework" content={submission.feedback} document={submission.feedbackDocument}/><ForumFiles links={submission.feedbackLinks ?? []} attachments={submission.feedbackAttachments ?? []}/></div>}
  </div>
  return framed ? <MemoCard label={`${submission.learnerName}第 ${submission.version} 次提交`} author={submission.learnerName} authorId={submission.learnerId} authorAvatarUrl={submission.learnerAvatarUrl} createdAt={submission.submittedAt} actions={<span className="text-xs text-muted-foreground">第 {submission.version} 版</span>}>{content}</MemoCard> : content
}
