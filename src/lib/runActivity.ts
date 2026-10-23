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
  kind: z.enum(['commentary', 'tool', 'answer', 'attention', 'result']), label: z.string().max(160),
  purpose: z.enum(['process', 'result']).optional(),
  requestVersion: z.number().int().positive().safe().optional(),
  order: z.number().int().nonnegative().safe().optional(),
  revision: z.number().int().nonnegative().safe().optional(),
  taskId: z.string().min(1).max(160).optional(),
}).strict()
export type ActivityAnnotation = z.infer<typeof activityAnnotationSchema>

/** Explicit, authorized delegated runs. A model span is not a business task. */
export const activityTasksSchema = z.object({ version: z.literal(1), tasks: z.array(z.object({
  id: z.string().min(1).max(160), parentId: z.string().min(1).max(160).optional(),
  label: publicText.pipe(z.string().max(160)),
  status: z.enum(['running', 'waiting', 'complete', 'partial', 'blocked', 'cancelled', 'error', 'unknown']),
}).strict()).max(100) }).strict().superRefine(({ tasks }, context) => {
  const byId = new Map(tasks.map(task => [task.id, task]))
  if (byId.size !== tasks.length) context.addIssue({ code: 'custom', message: 'Task identities must be unique' })
  for (const task of tasks) {
    const seen = new Set<string>([task.id])
    for (let parent = task.parentId; parent; parent = byId.get(parent)?.parentId) {
      if (!byId.has(parent) || seen.has(parent)) {
        context.addIssue({ code: 'custom', message: 'Task ancestry must be complete and acyclic' })
        break
      }
      seen.add(parent)
    }
  }
})
export type ActivityTasks = z.infer<typeof activityTasksSchema>
export function readActivityTasks(value: unknown): ActivityTasks | undefined {
  const parsed = activityTasksSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

/** Presentation only; the native part remains the single content/status owner. */
export function activityAnnotation(part: unknown): ActivityAnnotation | undefined {
  if (!part || typeof part !== 'object') return undefined
  const metadata = Reflect.get(part, 'providerMetadata')
  const product = metadata && typeof metadata === 'object' ? Reflect.get(metadata, 'lingxiloop') : undefined
  const result = activityAnnotationSchema.safeParse(product && typeof product === 'object' ? Reflect.get(product, 'activity') : undefined)
  return result.success ? result.data : undefined
}

/** Fixed producer lifecycle labels use the existing v1 metadata shape. */
export const answerRevisionLabels = {
  accepted: '已交付答复的原始片段',
  superseded: '已替换的答复草稿',
  failed: '未完成的答复草稿（已替换）',
  cancelled: '已取消的答复草稿（已替换）',
} as const
const answerRevisionLabelValues = new Set<string>(Object.values(answerRevisionLabels))

/** Explicit public-text lifecycle metadata only; ordinary commentary/report
 * labels and arbitrary body text never classify a part as a revision. Keep
 * source identities stable so stale pages reconcile with the current part. */
export function isAnswerRevision(part: unknown): boolean {
  const annotation = activityAnnotation(part)
  return annotation?.kind === 'commentary' && /^(?:archive:)?public-text:[a-f0-9]{64}$/.test(annotation.id)
    && (annotation.id.startsWith('archive:') || answerRevisionLabelValues.has(annotation.label))
}

export const toolDisplaySchema = z.object({
  title: z.string().max(160), purpose: z.string().max(500), summary: z.string().max(1000).optional(),
  input: z.array(z.object({ label: z.string().max(80), value: publicText.pipe(z.string().max(500)) }).strict()).max(8).optional(),
}).strict()
export type ToolDisplay = z.infer<typeof toolDisplaySchema>

const labels: Record<string, readonly [string, string]> = {
  ipython: ['执行脚本', '执行本次请求所需的脚本并检查实际结果。'],
  'skills.load': ['读取技能说明', '读取当前任务所需的技能使用说明。'],
  'skills.activate': ['确认技能交付', '记录本次请求需要交付的技能结果。'],
  'observations.read': ['读取工具结果', '继续读取已获授权的工具结果。'],
  'catalog.discover': ['查找可用工具', '查找当前授权允许使用的工具。'],
  'response.upgrade': ['准备完整答复', '按当前请求准备完整的答复格式。'],
  'task.read_evidence': ['回查引用依据', '读取已收集且获授权的依据片段。'],
  'task.read_attachment': ['回查请求附件', '按请求中的附件版本读取所需片段。'],
  'visualize.read_reference': ['查看可视化参考', '查阅当前可视化组件的使用说明。'],
  'visualize.save': ['保存可视化', '保存当前任务的可视化内容。'],
  'visualize.chart': ['生成数据图表', '根据给定数据计算并保存图表。'],
  'visualize.diagram': ['生成流程图', '根据给定步骤生成并保存流程图。'],
  'visualize.sliding_window': ['生成滑动窗口演示', '根据给定参数生成并保存滑动窗口演示。'],
  'visualize.read': ['读取可视化', '读取已保存且获授权的可视化内容。'],
  'visualize.export': ['导出可视化', '将已保存的可视化导出为附件。'],
  'documents.list': ['查找文档', '列出当前有权访问的文档。'],
  'documents.recent': ['查看最近文档', '查看最近创建且有权访问的文档。'],
  'documents.rename': ['重命名文档', '更新已授权文档的名称。'],
  'documents.delete': ['删除文档', '删除已授权且经确认的文档。'],
  'knowledge.check_source': ['核对课程资料', '核对课程资料当前版本与预期内容。'],
  'knowledge.add_text': ['添加文字资料', '保存文字资料并提交资料处理任务。'],
  'knowledge.add_url': ['添加网页资料', '添加网页资料并提交资料处理任务。'],
  'knowledge.add_file': ['添加文件资料', '将已提交的附件添加为课程资料。'],
  'knowledge.retry_ingestion': ['重试资料处理', '重新提交未完成的资料处理任务。'],
  'knowledge.set_source_enabled': ['调整资料可用状态', '按已批准的资料版本更新可用状态。'],
  'knowledge.delete_source': ['删除课程资料', '删除已批准的资料并安排关联资源清理。'],
  'directory.self': ['查看助手身份', '查看当前助手身份及有权参与的对话。'],
  'directory.participants': ['查找工作区成员', '查看当前工作区中可联系的成员。'],
  'directory.statuses': ['查看助手状态', '查看当前工作区助手的可用状态。'],
  'chat.metadata': ['查看当前对话', '读取当前对话的基本信息。'],
  'chat.list_mutes': ['查看静音设置', '查看当前助手对话的静音设置。'],
  'chat.add_member': ['添加对话成员', '将允许加入的成员添加到当前群聊。'],
  'chat.set_topic': ['更新对话主题', '更新当前对话的主题。'],
  'chat.rename': ['重命名对话', '核对当前名称后更新对话名称。'],
  'chat.set_muted': ['调整对话静音', '更新当前助手在对话中的静音设置。'],
  'chat.recommend': ['提出学习建议', '提供可选择的下一步学习建议。'],
  'chat.history': ['阅读对话历史', '读取当前对话中有权查看的历史消息。'],
  'chat.inbox': ['查看未读消息', '查看有权访问的对话中的未读消息。'],
  'chat.search': ['搜索对话内容', '查找当前对话中已保存的消息。'],
  'chat.ack': ['更新已读状态', '更新当前助手的对话已读状态。'],
  'chat.react': ['回应消息', '更新当前助手对已保存消息的回应。'],
  'canvas.current': ['查看协作画布', '查看当前画布、分工和报告。'],
  'canvas.available_agents': ['查找画布助手', '查看当前画布可用的协作助手。'],
  'canvas.create_frame': ['创建画布内容', '在当前画布中创建新的内容区域。'],
  'canvas.update_frame': ['更新画布内容', '根据已读取的版本更新画布内容。'],
  'canvas.append_content': ['补充画布内容', '向当前画布内容追加本次请求的信息。'],
  'canvas.delete_frame': ['删除画布内容', '删除获授权的画布内容区域。'],
  'canvas.add_comment': ['评论画布', '向当前画布添加评论。'],
  'canvas.start_workspace': ['启动画布协作', '为当前画布创建协作分工。'],
  'canvas.stop_assignment': ['停止协作分工', '停止指定分工及其派生任务。'],
  'canvas.stop_workspace': ['停止画布协作', '停止当前画布的协作执行。'],
  'canvas.submit_report': ['提交协作报告', '保存当前分工的报告及依据版本。'],
  'canvas.submit_verification': ['提交协作核验', '保存对协作报告的独立核验结果。'],
  'learning.list_assignments': ['查看作业列表', '查看当前课程的教师作业。'],
  'learning.get_assignment': ['阅读作业要求', '读取当前获授权作业的具体要求。'],
  'learning.list_submissions': ['查看作业提交', '读取当前学生有权查看的提交记录。'],
  'learning.submit_assignment': ['提交作业答案', '保存本次请求中的作业答案。'],
  'learning.get_homework': ['查看作业状态', '读取当前作业及提交状态。'],
  'learning.assess_homework': ['评阅作业', '根据当前作业要求评阅提交内容。'],
  'teacher.homework_overview': ['查看班级作业概况', '读取教师有权查看的作业完成概况。'],
  'polls.create': ['创建投票', '创建当前对话需要的投票。'],
  'polls.show': ['查看投票', '查看当前获授权投票的选项和状态。'],
  'polls.vote': ['提交投票', '提交当前允许的投票选项。'],
  'polls.close': ['结束投票', '结束当前获授权的投票。'],
  'presentations.create': ['创建演示文稿', '创建本次请求的演示文稿任务。'],
  'presentations.get': ['查看演示文稿', '查看演示文稿的内容与生成状态。'],
  'presentations.approve_outline': ['确认演示大纲', '确认当前演示大纲并继续制作。'],
  'presentations.revise_outline': ['修改演示大纲', '按本次请求修改演示大纲。'],
  'presentations.revise': ['修改演示文稿', '按本次请求修改演示文稿。'],
  'presentations.retry': ['重试演示制作', '重新提交未完成的演示制作任务。'],
  'presentations.cancel': ['取消演示制作', '停止当前演示制作任务。'],
  'routines.create': ['创建定时任务', '保存本次请求需要的定时任务。'],
  'routines.list': ['查看定时任务', '读取当前获授权的定时任务。'],
  'routines.activate': ['启用定时任务', '启用当前获授权的定时任务。'],
  'routines.pause': ['暂停定时任务', '暂停当前获授权的定时任务。'],
  'memory.list': ['查看记忆', '查看当前对话可用的记忆。'],
  'memory.read': ['读取记忆', '阅读与当前任务有关的记忆。'],
  'memory.summary': ['查看记忆', '读取这条记忆的公开摘要。'],
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
  'teacher.draft_homework': ['拟定作业', '整理作业要求与验收标准，等待你确认发布。'],
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

/** Resolve only known public aliases; never reinterpret an arbitrary identifier. */
export function canonicalToolName(action: string): string {
  const dotted = action.replace('__', '.')
  return Object.hasOwn(labels, dotted) ? dotted : action
}

/** Closed copy catalog: never use raw action identifiers or provider errors as labels. */
export function toolDisplay(action: string, status?: unknown): ToolDisplay {
  action = canonicalToolName(action)
  const [title, purpose] = labels[action] ?? groups[action.split('.')[0]] ?? ['处理任务', '执行当前任务中已授权的操作。']
  const summaries: Record<string, string> = {
    completed: '这一步已完成。', failed: '这一步未完成，请检查相关信息后重试。',
    cancelled: '这一步已停止。', unknown: '操作结果尚未确认，请先核对结果，避免重复执行。',
    'awaiting-approval': '需要你确认后才能继续。',
  }
  if (status === 'completed' && ['visualize.save','visualize.chart','visualize.diagram','visualize.sliding_window'].includes(action)) {
    return { title,purpose,summary: '可视化内容已保存。' }
  }
  if (status === 'completed' && action === 'memory.summary') return { title,purpose,summary: '已读取记忆摘要。' }
  if (status === 'failed' && action.startsWith('visualize.')) return { title,purpose,summary: `${title}未完成，请重试。` }
  if (status === 'failed' && action === 'ipython') return { title,purpose,summary: '脚本执行未完成，请重试。' }
  return { title, purpose, ...(typeof status === 'string' && summaries[status] ? { summary: summaries[status] } : {}) }
}

/** Refresh old generic titles without losing authorized inputs or recorded results. */
export function resolveToolDisplay(action: string, status: unknown, recorded?: unknown): ToolDisplay {
  const base = toolDisplay(action, status), parsed = toolDisplaySchema.safeParse(recorded)
  if (!parsed.success) return base
  const generic = parsed.data.title === '处理任务' || Object.values(groups).some(([title]) => title === parsed.data.title)
  return { ...base, ...parsed.data, ...(generic && base.title !== '处理任务' ? { title: base.title, purpose: base.purpose } : {}),
    ...(base.summary && (typeof status === 'string' && status !== 'completed'
      || parsed.data.summary === '可视化内容已保存；展示引用是否交付会在答复中确认。') ? { summary: base.summary } : {}) }
}
