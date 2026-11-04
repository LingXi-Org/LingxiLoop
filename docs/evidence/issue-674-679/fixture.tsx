import { TooltipProvider } from '../../../src/components/ui/tooltip'
import { createRoot } from 'react-dom/client'
import { HomeworkSubmissionView } from '../../../src/features/learning/homework/HomeworkReport'
import { HomeworkTeacher } from '../../../src/features/learning/homework/HomeworkTeacher'
import { homeworkApi } from '../../../src/features/learning/homework/api'
import { ThemeProvider } from 'next-themes'
import type { Homework, HomeworkSubmission } from '../../../src/features/learning/homework/contracts'
import '../../../src/styles/app.css'
const raw='2+3*4、3*-2、a*b、x**2\n\n*斜体*\n\n* 列表\n\n```python\nx = 2+3*4\nprint(x)\n```'
const submission:HomeworkSubmission={id:'fixture-submission',learnerId:'fixture-student',learnerName:'测试学生',version:1,answer:{text:raw,links:[],attachments:[]},submittedAt:'2026-11-04T00:10:00Z',late:false,reviewStatus:'PENDING',feedback:'',report:{id:'fixture-report',answerRevision:1,homeworkRevision:2,generatedAt:'2026-11-04T00:09:00Z',verification:'verified',completion:'已记录可见证据，评分等级待教师判断。',criteria:[{criterion:'保留运行表达式',met:true,independent:true,feedback:'原文包含 2+3*4',evidence:[{messageId:'student-stable-2',excerpt:raw}]},{criterion:'教师按四级量规确定等级',met:false,independent:false,feedback:'此项评分由教师确定。',reviewRequired:true}],assistance:'助手解释过运算顺序。',assistanceEvidence:[{messageId:'assistant-stable-4',excerpt:'先算乘法'}],independence:'学生解释待教师复核。',weaknesses:[],evidence:[raw,'旧引用'],evidenceSources:[{messageId:'student-stable-2',excerpt:raw},{messageId:'deleted-message',excerpt:'旧引用'}],manualReview:null},conversationReferences:[{channelId:'private-course',title:'作业学习对话',messageIds:['student-stable-2','assistant-stable-4'],capturedAt:'2026-11-04T00:10:00Z',messages:[{id:'student-stable-2',role:'user',text:raw,sequence:2,timestamp:1793750400},{id:'assistant-stable-4',role:'assistant',text:'先算乘法，再算加法。',sequence:4,timestamp:1793750450}]}]}
const homework={id:'fixture-homework',courseId:'fixture-course',dueAt:null,status:'PUBLISHED',revision:2} as Homework
homeworkApi.learners=async()=>({items:[{learnerId:'fixture-student',learnerName:'测试学生',status:'PENDING',missingCriteria:[],evidenceRevision:1,latestSubmission:submission,manualReview:null}],nextOffset:null})
createRoot(document.getElementById('root')!).render(<ThemeProvider attribute="class" defaultTheme="light"><TooltipProvider><main className="mx-auto max-w-3xl space-y-8 p-4"><HomeworkTeacher homework={homework} canReview={false} canEdit={false} onUpdated={()=>{}}/><HomeworkSubmissionView submission={submission} framed={false}/></main></TooltipProvider></ThemeProvider>)
