type PublicActivityLevel = 'debug' | 'info' | 'warn' | 'error'

/** User-visible activity is intentionally an allowlist with fixed copy.
 * Runtime event titles and data are internal observability input and may carry
 * provider errors, tool arguments, model summaries, or other sensitive text. */
const PUBLIC_ACTIVITY_TITLES: Readonly<Record<string, string>> = Object.freeze({
  'run.started': '开始处理任务',
  'run.completed': '任务处理完成',
  'run.failed': '任务处理失败',
  'run.cancelled': '任务处理已停止',
  'run.skipped': '已跳过任务',
  'run.waiting_for_human': '正在等待你的输入',
  'turn.started': '开始当前步骤',
  'turn.completed': '当前步骤已完成',
  'turn.failed': '当前步骤失败',
  'turn.skipped': '已跳过当前步骤',
  'turn.steered': '新输入已加入当前步骤',
  'turn.compacted': '工作上下文已整理',
  'turn.completion_verified': '完成结果已核验',
  'turn.completion_rejected': '仍需继续处理',
  'turn.tool_interrupted': '工具步骤已为新输入中断',
  'model.started': '正在规划下一步',
  'model.delta': '正在组织回复',
  'model.completed': '规划步骤已完成',
  'model.error': '规划步骤失败',
  'model.retry_provider_connection': '正在重新连接模型',
  'model.retry_no_images': '正在移除图片后重试',
  'tool.started': '正在使用工具',
  'tool.finished': '工具步骤已完成',
  'approval.requested': '正在等待你的批准',
  'approval.resumed': '已收到批准并继续处理',
  'approval.continuation_completed': '已完成批准的操作',
  'approval.pending': '正在等待你的批准',
  'fs.hydrated': '工作区已加载',
  'fs.committed': '工作区更改已保存',
  'fs.commit_failed': '工作区更改保存失败',
  'context.loaded': '工作上下文已加载',
  'typing.started': '正在准备回复',
  'typing.finished': '回复已准备完成',
  'status.changed': '正在切换教学模式',
  'budget.stop': '任务已在预算上限停止',
  'message.posted': '消息已发送',
  'handoff.created': '已创建任务交接',
  'memory.learned': '长期记忆已更新',
  'autonomy.learned': '自主规则已更新',
})

export const PUBLIC_ACTIVITY_KINDS = Object.freeze(Object.keys(PUBLIC_ACTIVITY_TITLES))

export function publicActivityTitle(kind: string, level: PublicActivityLevel = 'info'): string | null {
  if (level === 'debug') return null
  if (/(prompt|reasoning|chain[._-]?of[._-]?thought|secret|credential)/i.test(kind)) return null
  return PUBLIC_ACTIVITY_TITLES[kind] ?? null
}
