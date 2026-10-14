import { z } from 'zod'

export const publicText = z.string().trim().min(1).max(8000).refine(value =>
  !/<\/?(?:think|analysis|system|scratchpad)>|<\|(?:im_start|im_end|channel|analysis)|\b(?:sk-[a-zA-Z0-9]{16,}|Bearer\s+[a-zA-Z0-9._-]{16,})/i.test(value),
'公开说明不能包含内部推理、协议或凭据')

/** An explicitly published explanation, never a provider reasoning field. */
export const publicActivitySchema = z.object({
  version: z.literal(1), id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  kind: z.enum(['commentary', 'reasoning', 'plan']), label: publicText.pipe(z.string().max(120)),
  text: publicText, state: z.enum(['running', 'complete']).describe('Use complete only when this public item is finished. For a plan, every step must be complete.'),
  plan: z.object({ steps: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), label: publicText.pipe(z.string().max(160)),
    description: publicText.pipe(z.string().max(500)).optional() }).strict()).min(1).max(50),
    activeIndex: z.number().int().nonnegative().describe('Number of COMPLETED steps, not the index of the last completed step. 0 means none done. For state=complete this must equal steps.length; a two-step complete plan requires activeIndex=2.'),
  }).strict().optional().describe('Required only for kind=plan. Send the full steps and activeIndex on every update; reuse stable step ids.'),
}).strict().superRefine((value, context) => {
  if ((value.kind === 'plan') !== Boolean(value.plan)) context.addIssue({ code: 'custom', message: 'kind=plan 必须包含完整 plan；其他类型不能包含 plan。', path: ['plan'] })
  if (!value.plan) return
  if (new Set(value.plan.steps.map(step => step.id)).size !== value.plan.steps.length) context.addIssue({ code: 'custom', message: '计划中每个步骤必须有不同的 id。', path: ['plan', 'steps'] })
  if (value.plan.activeIndex > value.plan.steps.length || value.state === 'complete' && value.plan.activeIndex !== value.plan.steps.length) {
    context.addIssue({ code: 'custom', message: `activeIndex 是已完成步骤数量。state=complete 时必须等于 steps.length（${value.plan.steps.length}）。`, path: ['plan', 'activeIndex'] })
  }
})
export type PublicActivity = z.infer<typeof publicActivitySchema>

export const activityAnnotationSchema = z.object({
  version: z.literal(1), id: z.string().min(1).max(2000),
  kind: z.enum(['commentary', 'tool', 'answer', 'attention']), label: z.string().max(160),
}).strict()
export type ActivityAnnotation = z.infer<typeof activityAnnotationSchema>

/** Presentation only; the native part remains the single content/status owner. */
export function activityAnnotation(part: unknown): ActivityAnnotation | undefined {
  if (!part || typeof part !== 'object') return undefined
  const metadata = Reflect.get(part, 'providerMetadata')
  const product = metadata && typeof metadata === 'object' ? Reflect.get(metadata, 'lingxiloop') : undefined
  const result = activityAnnotationSchema.safeParse(product && typeof product === 'object' ? Reflect.get(product, 'activity') : undefined)
  return result.success ? result.data : undefined
}

export const toolDisplaySchema = z.object({
  title: z.string().max(160), purpose: z.string().max(500), summary: z.string().max(1000).optional(),
  input: z.array(z.object({ label: z.string().max(80), value: publicText.pipe(z.string().max(500)) }).strict()).max(8).optional(),
}).strict()
export type ToolDisplay = z.infer<typeof toolDisplaySchema>

const labels: Record<string, readonly [string, string]> = {
  'memory.list': ['查看记忆', '查看当前对话可用的记忆。'],
  'memory.read': ['读取记忆', '阅读与当前任务有关的记忆。'],
  'memory.search': ['搜索记忆', '查找与当前问题相关的记忆。'],
  'memory.apply': ['保存记忆', '保存本次请求中的记忆变更。'],
  'memory.history': ['查看记忆历史', '查看这条记忆的历史版本。'],
  'memory.restore': ['恢复记忆', '恢复指定版本的记忆。'],
  'memory.forget': ['忘记记忆', '清除指定范围内的记忆。'],
  'memory.reflect': ['整理记忆', '安排整理已有记忆。'],
  'memory.doctor': ['检查记忆', '检查记忆的冲突和可用状态。'],
  'research.search': ['查找资料', '搜索与当前问题相关的公开资料。'],
  'research.read': ['阅读网页', '核对已找到的网页内容。'],
  'knowledge.search': ['检索课程资料', '在你有权访问的课程资料中查找依据。'],
  'knowledge.read_source': ['阅读课程原文', '核对课程原文及引用依据。'],
  'knowledge.list_sources': ['查看课程资料', '检查当前可用的课程资料。'],
  'documents.read': ['阅读文档', '查看当前任务相关且已授权的文档。'],
  'documents.edit': ['更新文档', '将本次请求的改动写入文档。'],
  'documents.create': ['创建文档', '创建本次请求需要的文档。'],
  'files.list': ['查看附件', '检查本次请求已选择的附件。'],
  'files.read': ['阅读附件', '阅读本次请求已选择的附件内容。'],
  'files.create': ['生成文件', '生成本次请求需要的可下载文件。'],
  'chat.report_progress': ['整理任务说明', '发布面向你的任务进展或解题说明。'],
  'chat.send': ['发送消息', '向已授权的对话发送本次任务消息。'],
  'chat.ask': ['补充信息', '收集继续完成任务所需的信息。'],
  'task.ask': ['补充信息', '等待你补充继续任务所需的信息。'],
  'task.contract': ['制定任务计划', '整理本次请求的交付内容与检查条件。'],
  'task.inspect': ['核对执行结果', '核对任务中待处理的操作和已确认结果。'],
  'task.check_receipt': ['核对操作结果', '检查已记录的操作是否满足本次请求。'],
  'task.check_resource': ['检查最新内容', '读取当前内容并核对预期结果。'],
}
const groups: Record<string, readonly [string, string]> = {
  canvas: ['协作处理', '协调当前任务的协作内容与实际结果。'],
  handoffs: ['协作任务', '查看或推进已授权的协作任务。'],
  learning: ['学习任务', '查看或推进当前学习任务。'],
  teacher: ['教学任务', '处理当前授权范围内的教学任务。'],
  directory: ['查找协作成员', '查看当前任务可联系的成员。'],
  polls: ['处理投票', '处理当前对话中的投票。'],
  presentations: ['制作演示文稿', '生成或检查本次请求的演示文稿。'],
  routines: ['处理定时任务', '处理已授权的定时任务。'],
  conversations: ['查看对话', '读取已授权的对话信息。'],
}

/** Closed copy catalog: never use raw action identifiers or provider errors as labels. */
export function toolDisplay(action: string, status?: unknown): ToolDisplay {
  action = action.replace(/^memory__/, 'memory.')
  const [title, purpose] = labels[action] ?? groups[action.split('.')[0]] ?? ['处理任务', '执行当前任务中已授权的操作。']
  const summaries: Record<string, string> = {
    completed: '这一步已完成。', failed: '这一步未完成，请检查相关信息后重试。',
    cancelled: '这一步已停止。', unknown: '操作结果尚未确认，请先核对结果，避免重复执行。',
    'awaiting-approval': '需要你确认后才能继续。',
  }
  return { title, purpose, ...(typeof status === 'string' && summaries[status] ? { summary: summaries[status] } : {}) }
}
