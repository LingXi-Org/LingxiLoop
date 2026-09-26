import { createHash } from 'node:crypto'
import { NoEffectError, type ActionContext, type PresentationDefinition, type ToolDefinition } from '@lyyzka/lingxios'
import { productConversationId } from './identity.js'

/** Resolve through the owning public tool: the same role and audience checks apply. */
export function productCards(tools: readonly ToolDefinition[]): PresentationDefinition[] {
  const read = async (context: ActionContext, action: string, input: Record<string, unknown>) => {
    const tool = tools.find(item => item.action === action)
    if (!tool) throw new Error('presentation action is unavailable')
    const child = { ...context, action: { ...context.action, action } }
    const args = tool.parse(input)
    await tool.authorize(child, args)
    const result = await tool.execute(child, args)
    if (!result.ok) throw new NoEffectError('presentation source could not be read')
    return result.value
  }
  const source = (reference: string, value: unknown) => [{ ref: reference, version: createHash('sha256').update(JSON.stringify(value)).digest('hex'), observedAt: new Date().toISOString() }]
  return [{ type: 'calendar-event', version: '1', description: 'Show an authorized calendar event. Reference is the event ID returned by calendar tools.', actions: ['calendar.get'],
    async authorize(context, reference) { await read(context, 'calendar.get', { eventId: reference }) },
    async resolve(context, reference) {
      const value = await read(context, 'calendar.get', { eventId: reference }) as Record<string, unknown>
      const { id, title, startAt, endAt, allDay } = value
      return { fields: { event: { id, title, startAt, endAt, allDay } }, sources: source('calendar:' + reference, { id, title, startAt, endAt, allDay }) }
    } }, { type: 'learning-stats', version: '1', description: 'Show current learner summary counts from authorized course records. Reference must be the current product conversation ID. Counts describe the loaded learning context, not the whole course.', actions: ['learning.get_learner_state'],
    async authorize(context, reference) {
      if (reference !== productConversationId(context.work)) throw new NoEffectError('statistics reference is outside this conversation', 'forbidden')
      await read(context, 'learning.get_learner_state', {})
    },
    async resolve(context, reference) {
      const value = await read(context, 'learning.get_learner_state', {}) as { knowledgeUnits?: unknown[]; due?: unknown[]; pendingTeacherReviews?: unknown[]; activeMission?: unknown } | null
      if (!value) return null
      const fields = { id: 'learning:' + reference, title: '当前学习概况', description: '当前加载的学习记录；不是全课程统计。', stats: [
        { key: 'units', label: '当前知识点', value: value.knowledgeUnits?.length ?? 0 },
        { key: 'due', label: '当前待复习', value: value.due?.length ?? 0 },
        { key: 'mission', label: '进行中的任务', value: value.activeMission ? 1 : 0 },
      ] }
      return { fields, sources: source('learning:' + reference, fields) }
    } }]
}
