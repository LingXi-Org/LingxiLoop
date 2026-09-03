import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  type ThreadAssistantMessagePart,
  type ThreadMessage,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import { type ReactNode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AgentStatus } from '@/components/assistant-ui/elements/agent-status'
import { AppThemeProvider } from '@/components/AppThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { ConversationMessage } from '@/features/chat/components/ConversationMessage'
import { useParticipants } from '@/features/agents/state'
import {
  convertEnvelope,
  convertEnvelopeBatch,
  projectMessageGroups,
} from '@/features/chat/runtime/converter'
import { getLingxiMessageMetadata, resolveMessagePresentation } from '@/features/chat/runtime/model'
import { applyAssistantStreamChunks } from '@/features/chat/runtime/stream'
import type { ImEnvelope, LingxiMessageV1 } from '@/lib/im/wukong'
import type { Participant } from '@/types'
import '@/styles/globals.css'
import './preview.css'

const CHAT_PALETTES = [
  { id: 'current', label: '当前原生' },
  { id: 'neutral', label: '中性墨' },
  { id: 'zinc', label: '锌灰' },
  { id: 'stone', label: '暖石' },
  { id: 'mauve', label: '雾紫' },
  { id: 'olive', label: '橄榄' },
] as const

const AGENT: Participant = {
  id: 'agent-nova',
  kind: 'agent',
  name: '智能助教',
  role: '学习协调智能体',
  initial: '学',
  avatarBg: '#4682f6',
  avatarUrl: null,
  status: 'working',
}

const PULSE: Participant = {
  id: 'agent-pulse',
  kind: 'agent',
  name: '教学运营助手',
  role: '教学运营智能体',
  initial: '教',
  avatarBg: '#7c5cff',
  avatarUrl: null,
  status: 'working',
}

const SCOUT: Participant = {
  id: 'agent-scout',
  kind: 'agent',
  name: '证据核验助手',
  role: '学习证据核验智能体',
  initial: '证',
  avatarBg: '#34a853',
  avatarUrl: null,
  status: 'working',
}

const REVIEWER: Participant = {
  id: 'reviewer',
  kind: 'human',
  name: '界面审查员',
  initial: '审',
  avatarBg: '#dbeafe',
  avatarUrl: null,
  status: 'avail',
}

const PARTICIPANTS = { [AGENT.id]: AGENT, [PULSE.id]: PULSE, [SCOUT.id]: SCOUT, [REVIEWER.id]: REVIEWER }
useParticipants.setState({ byId: PARTICIPANTS, loaded: true })

const HOST_PROTOCOL = [
  ['chat', '对话', [['history', '查看历史'], ['send', '发送消息'], ['ask', '发起提问'], ['handoff', '任务交接']]],
  ['memory', '记忆', [['recall', '检索记忆'], ['list', '列出记忆'], ['note', '记录记忆'], ['verify', '验证记忆']]],
  ['files', '文件', [['list', '列出文件'], ['read', '读取文件'], ['write', '写入文件'], ['edit', '编辑文件'], ['grep', '搜索内容']]],
  ['documents', '文档', [['list', '列出文档'], ['create', '创建文档'], ['read', '读取文档'], ['append', '追加内容'], ['prepend', '前置内容'], ['replace', '替换内容'], ['replace_block', '替换区块'], ['rename', '重命名文档'], ['delete', '删除文档']]],
  ['canvas', '协作画布', [['available_agents', '查看可用智能体'], ['start_workspace', '启动协作画布'], ['add_agents', '添加智能体'], ['get', '查看画布'], ['submit_report', '提交报告'], ['handoff', '任务交接'], ['create_frame', '创建画布块'], ['set_status', '设置状态'], ['update_frame', '更新画布块'], ['append_content', '追加内容'], ['delete_frame', '删除画布块']]],
  ['calendar', '日历', [['list', '列出日程'], ['get', '查看日程'], ['create', '创建日程'], ['update', '更新日程'], ['run_now', '立即执行'], ['dispatches', '查看执行记录'], ['cancel', '取消日程'], ['delete', '删除日程']]],
  ['routines', '例行任务', [['list', '列出任务'], ['pause', '暂停任务'], ['activate', '启用任务'], ['create', '创建任务']]],
  ['research', '研究', [['search', '搜索资料'], ['read', '阅读资料']]],
  ['email', '邮件', [['whoami', '查看身份'], ['contacts', '查找联系人'], ['inbox', '查看收件箱'], ['show', '查看会话'], ['send', '发送邮件'], ['reply', '回复邮件']]],
  ['knowledge', '知识库', [['list_sources', '列出来源'], ['add_text', '添加文本'], ['add_url', '添加网址'], ['add_file', '添加文件'], ['retry_ingestion', '重试摄取'], ['set_source_enabled', '设置来源状态'], ['delete_source', '删除来源']]],
  ['presentations', '演示文稿', [['create', '创建演示'], ['get', '查看演示'], ['revise_outline', '修改大纲'], ['approve_outline', '批准大纲'], ['revise', '修改演示'], ['cancel', '取消生成'], ['retry', '重试生成']]],
  ['learning', '学习', [['current', '查看当前学习状态'], ['get_learner_state', '获取学习者状态'], ['list_knowledge_units', '列出知识单元'], ['list_due', '列出到期任务'], ['get_mission', '获取学习任务'], ['get_activity', '获取学习活动'], ['start_mission', '启动学习任务'], ['add_steps', '添加步骤'], ['finish_planning', '完成规划'], ['update_step', '更新步骤'], ['complete_mission', '完成学习任务'], ['draft_knowledge_units', '起草知识单元'], ['draft_activity', '起草学习活动'], ['record_attempt', '记录作答'], ['propose_evaluation', '提交学习评价']]],
  ['polls', '投票', [['create', '创建投票'], ['vote', '参与投票'], ['close', '关闭投票'], ['show', '查看投票']]],
  ['teacher', '教学运营', [['current', '查看当前教学状态'], ['overview', '教学概览'], ['list_learners', '列出学习者'], ['get_learner', '查看学习者'], ['get_attempt', '查看作答'], ['list_objectives', '列出学习目标'], ['list_activities', '列出教学活动'], ['list_reviews', '列出复核事项'], ['list_rooms', '列出教室'], ['get_digest_schedule', '查看简报计划'], ['draft_objectives', '起草学习目标'], ['draft_activity', '起草教学活动'], ['update_course', '更新课程'], ['set_learner_membership', '设置学习者成员'], ['set_room_binding', '设置教室绑定'], ['configure_digest', '配置简报'], ['publish_objective', '发布学习目标'], ['publish_activity', '发布教学活动'], ['close_activity', '关闭教学活动'], ['archive_objective', '归档学习目标'], ['transition_course', '转换课程状态'], ['set_teacher_membership', '设置教师成员'], ['review_evaluation', '复核学习评价']]],
] as const

const CARD_ROUTES = [
  ['agent.activity', '智能体活动', '智能体状态'],
  ['2+ tool.started/completed', '多步工具活动', '工具时间线'],
  ['knowledge.rag.completed', '知识引用已完成', '置信标记'],
  ['approval.pending', '等待审批', '建议卡片'],
  ['poll snapshot', '投票快照', '信息补充表单'],
  ['chat.ask / questionnaire', '智能体提问', '信息补充表单'],
  ['chat.handoff', '智能体交接', '智能体交接'],
  ['learning.start_mission', '启动学习任务', '智能体计划'],
  ['canvas.start_workspace', '启动协作画布', '产物卡片'],
  ['teacher_briefing', '教学简报', '统计看板'],
  ['learning.propose_evaluation', '提交学习评价', '评分明细'],
  ['calendar.create', '创建复习安排', '创建日程'],
  ['calendar.get', '查看单个复习安排', '查看日程'],
  ['calendar.list', '查看复习安排列表', '日程卡片组'],
  ['email delivery', '邮件送达', '草拟邮件'],
  ['presentation artifact', '演示文稿产物', '产物卡片'],
  ['attachment', '对话附件', '文件列表'],
] as const

let sequence = 0
function envelope(payload: LingxiMessageV1, fromUid = AGENT.id): ImEnvelope {
  sequence += 1
  return {
    messageId: `review-message-${sequence}`,
    messageSeq: sequence,
    clientMsgNo: payload.clientMsgNo,
    channelId: 'host-protocol-review',
    channelType: 2,
    fromUid,
    timestamp: Date.now() - (20 - sequence) * 60_000,
    payload,
  }
}

const sourceTitle = '学习科学手册'
const evidence = [
  { excerpt: '把练习分散到数天进行有助于提高长期保持效果。', page: 2 },
  { excerpt: '在尝试后及时反馈，提取练习的效果最佳。', page: 4 },
]

const PERSISTED_ENVELOPES = [
  envelope({
    version: 1,
    kind: 'text',
    clientMsgNo: 'agent-answer-with-evidence',
    body: '- [间隔练习与带反馈的提取练习可以共同提高长期保持。](#cite-S1)\n- [及时反馈可以强化提取练习的效果。](#cite-S1)',
    refs: { runId: 'run-evidence', agentId: AGENT.id },
    data: {
      rag: {
        claims: [{
          id: 'claim-1',
          text: '间隔练习与带反馈的提取练习可以共同提高长期保持。',
          confidence: 'grounded',
          basis: sourceTitle,
          markers: ['S1'],
        }, {
          id: 'claim-2',
          text: '及时反馈可以强化提取练习的效果。',
          confidence: 'grounded',
          basis: sourceTitle,
          markers: ['S1'],
        }],
        documentReferences: [{
          marker: 'S1',
          sourceId: 'source-learning-science',
          title: sourceTitle,
          pages: 4,
          anchors: evidence.map((item) => ({ page: item.page, quote: item.excerpt })),
        }],
      },
    },
  }),
  envelope({
    version: 1,
    kind: 'approval',
    clientMsgNo: 'approval-review',
    body: '允许智能助教发送本周学习进度邮件',
    refs: { approvalId: 'approval-review', runId: 'run-approval', agentId: AGENT.id },
    data: {
      id: 'approval-review', agentId: AGENT.id, kind: 'external_communication',
      summary: '允许智能助教发送本周学习进度邮件', status: 'PENDING',
      payload: { action: 'email.send', args: { to: ['教师@灵犀循环.中国'] } },
      requestedAt: new Date().toISOString(), requestedBy: REVIEWER.id,
      scope: { risk: 'external_communication' }, preview: { subject: '本周学习进度' },
    },
  }),
  envelope({
    version: 1,
    kind: 'approval',
    clientMsgNo: 'calendar-create-review',
    body: '确认创建安排：线性代数复习',
    refs: { approvalId: 'calendar-create-review', runId: 'run-calendar-create', agentId: AGENT.id },
    data: {
      id: 'calendar-create-review', agentId: AGENT.id, kind: 'calendar_create',
      summary: '确认创建安排：线性代数复习', status: 'PENDING',
      payload: {
        action: 'calendar.create',
        args: { title: '线性代数复习', at: '2026-09-04T19:30:00+08:00', kind: 'personal' },
      },
      requestedAt: new Date().toISOString(), requestedBy: REVIEWER.id,
      scope: { risk: 'calendar_create' },
      preview: { title: '线性代数复习', at: '2026-09-04T19:30:00+08:00' },
    },
  }),
  envelope({
    version: 1,
    kind: 'poll',
    clientMsgNo: 'poll-review',
    body: '📊 下次复习主题',
    refs: { pollClientMsgNo: 'poll-review' },
    data: {
      poll: {
        question: '下次优先复习哪个主题？', mode: 'single', closedAt: null,
        options: [
          { id: 'vectors', text: '向量与空间' },
          { id: 'probability', text: '条件概率' },
          { id: 'calculus', text: '微积分应用' },
        ],
      },
      pollTallies: [
        { optionId: 'vectors', count: 3, voterIds: ['u1', 'u2', 'u3'] },
        { optionId: 'probability', count: 2, voterIds: ['u4', 'u5'] },
        { optionId: 'calculus', count: 1, voterIds: ['u6'] },
      ],
      revision: 1,
    },
  }),
  envelope({
    version: 1,
    kind: 'questionnaire',
    clientMsgNo: 'questionnaire-review',
    body: '制定下一阶段复习计划',
    refs: { runId: 'run-questionnaire', agentId: AGENT.id },
    data: {
      questionnaire: {
        title: '制定下一阶段复习计划',
        items: [
          {
            name: 'focus', prompt: '下一阶段优先巩固哪个主题？', required: true,
            choices: [
              { value: 'vector-space', label: '向量空间', description: '定义、子空间与基' },
              { value: 'linear-map', label: '线性映射', description: '核、像与矩阵表示' },
              { value: 'eigenvalue', label: '特征值', description: '对角化与应用' },
            ],
          },
          {
            name: 'minutes', prompt: '每天计划投入多少分钟？', required: true,
            input: { label: '每日时长', placeholder: '例如 45' },
          },
        ],
        submitLabel: '保存计划',
      },
    },
  }),
  envelope({
    version: 1,
    kind: 'handoff',
    clientMsgNo: 'handoff-review',
    body: '请证据核验智能体检查学习证据',
    refs: { runId: 'run-handoff', fromAgentId: AGENT.id, toAgentId: SCOUT.id },
    data: {
      title: '核验学习证据', status: 'pending',
      fromAgentId: AGENT.id, toAgentId: SCOUT.id,
      note: '并行梳理错题、概念缺口与下一步练习', sharedPaths: ['错题记录'],
    },
  }),
  envelope({
    version: 1,
    kind: 'canvas',
    clientMsgNo: 'canvas-review',
    body: '线性代数学习诊断',
    refs: { canvasId: 'canvas-review', runId: 'run-canvas', agentId: AGENT.id },
    data: {
      canvasId: 'canvas-review', title: '线性代数学习诊断',
      goal: '并行梳理错题、概念缺口与下一步练习', status: 'working',
      members: [
        { agentId: 'agent-scout', assignment: '证据核验', color: '#4682f6', status: 'working' },
        { agentId: 'agent-forge', assignment: '练习设计', color: '#7c5cff', status: 'queued' },
      ],
      frameCount: 2, suppressAgentWake: true,
    },
  }),
  envelope({
    version: 1,
    kind: 'learning_mission',
    clientMsgNo: 'learning-mission-review',
    body: '两周掌握线性代数核心概念',
    refs: { agentId: AGENT.id },
    data: {
      missionId: 'mission-review', projectId: 'project-review',
      goal: '两周掌握线性代数核心概念',
      successCriteria: '能够独立解释向量空间并完成综合题',
      kind: 'STUDY', coordinatorAgentId: AGENT.id, status: 'ACTIVE', suppressAgentWake: true,
    },
  }),
  envelope({
    version: 1,
    kind: 'system',
    clientMsgNo: 'teacher-briefing-review',
    body: '本周期共有 18 条学习更新，其中 3 项需要教师关注。',
    refs: { briefingId: 'briefing-review', attentionItemIds: ['attention-1', 'attention-2', 'attention-3'] },
    data: {
      type: 'teacher_briefing',
      dashboard: {
        id: 'teacher-briefing-review', role: 'information', title: '学习情况总结', description: '序列 120–184',
        stats: [
          { key: 'updates', label: '学习更新', value: 18, sparkline: { data: [12, 16, 14, 18], color: 'var(--chart-1)' } },
          { key: 'attention', label: '需要关注', value: 3, sparkline: { data: [5, 4, 4, 3], color: 'var(--chart-2)' } },
          { key: 'normal', label: '正常进展', value: 15, sparkline: { data: [7, 12, 10, 15], color: 'var(--chart-3)' } },
          { key: 'types', label: '更新类型', value: 4, sparkline: { data: [2, 3, 3, 4], color: 'var(--chart-4)' } },
        ],
      },
    },
  }, PULSE.id),
  envelope({
    version: 1,
    kind: 'attachment',
    clientMsgNo: 'attachment-review',
    body: '课程评分量表',
    refs: { runId: 'run-attachment', agentId: AGENT.id },
    data: {
      key: 'review/rubric.pdf', url: 'https://example.com/rubric.pdf',
      name: '课程评分量表', mime: 'application/pdf', size: 284_120, kind: 'file',
    },
  }),
  envelope({
    version: 1,
    kind: 'artifact',
    clientMsgNo: 'presentation-review',
    body: '向量空间：从直觉到证明',
    refs: { presentationId: 'presentation-review', agentId: AGENT.id },
    data: {
      artifactId: 'presentation-review', artifactKind: 'lecture_deck_html',
      title: '向量空间：从直觉到证明',
    },
  }),
  envelope({
    version: 1,
    kind: 'email',
    clientMsgNo: 'email-review',
    body: '老师您好，本周已完成向量空间与线性映射的复习。',
    refs: { runId: 'run-email', agentId: AGENT.id },
    data: {
      email: {
        subject: '本周学习进度', from: '智能助教@灵犀循环.中国',
        to: ['教师@灵犀循环.中国'], cc: [], direction: 'outbound',
        transportStatus: 'sent', transportError: null,
      },
    },
  }),
]

function hostToolParts(calls: ReadonlyArray<{
  name: string
  args: Record<string, unknown>
  result: unknown
  isError?: boolean
}>): ThreadAssistantMessagePart[] {
  let parts: ThreadAssistantMessagePart[] = []
  calls.forEach((call, index) => {
    const toolCallId = `host:review:${index}`
    parts = applyAssistantStreamChunks(parts, [
      { type: 'part-start', path: [index], part: { type: 'tool-call', toolCallId, toolName: call.name } },
      { type: 'text-delta', path: [index], textDelta: JSON.stringify(call.args) },
      { type: 'tool-call-args-text-finish', path: [index] },
      { type: 'result', path: [index], result: call.result, isError: call.isError ?? false },
      { type: 'part-finish', path: [index] },
    ])
  })
  return parts
}

function streamedMessage(id: string, runId: string, content: ThreadAssistantMessagePart[]): ThreadMessage {
  const base = convertEnvelope(envelope({
    version: 1,
    kind: 'text',
    clientMsgNo: id,
    body: '主机数据流',
    refs: { runId, agentId: AGENT.id },
  }), { participants: PARTICIPANTS, meId: REVIEWER.id })
  if (base.role !== 'assistant') throw new Error('Host stream review message must be an assistant message')
  return {
    ...base,
    id: `preview-${runId}`,
    content,
    status: { type: 'complete', reason: 'stop' },
    metadata: {
      ...base.metadata,
      custom: {
        ...getLingxiMessageMetadata(base),
        presentation: resolveMessagePresentation(content),
      },
    },
  }
}

const SCORE_MESSAGE = streamedMessage('score-review', 'run-score', hostToolParts([{
  name: 'learning.propose_evaluation',
  args: {
    attemptId: 'attempt-review', demonstratedLevel: 3.4, confidence: 0.86,
    rubricResults: [
      { label: '概念准确性', score: 3.5, weight: 2, note: '能够区分张成、线性无关与基。' },
      { label: '推理完整性', score: 3.0, weight: 1, note: '证明步骤完整，个别符号需要统一。' },
      { label: '迁移应用', score: 3.6, weight: 1, note: '可以把概念应用到新题型。' },
    ],
  },
  result: { status: 'completed', value: { status: 'ACCEPTED', evaluationId: 'evaluation-review' } },
}]))

const CALENDAR_VIEW_MESSAGE = streamedMessage('calendar-view-review', 'run-calendar-view', hostToolParts([{
  name: 'calendar.get',
  args: { eventId: 'event-review' },
  result: {
    status: 'completed',
    value: {
      id: 'event-review', companyId: 'company-review', createdBy: REVIEWER.id,
      kind: 'personal', title: '线性代数复习', description: '完成向量空间与基的错题复盘',
      assigneeId: null, targetConversationId: null, agentPrompt: null,
      startAt: '2026-09-04T19:30:00+08:00', endAt: '2026-09-04T20:15:00+08:00',
      allDay: false, recurrence: null, status: 'active', lastFiredAt: null,
      reminderMinutesBefore: 15, reminderChannel: 'toast', isPrivate: true,
      createdAt: '2026-09-02T10:00:00+08:00', updatedAt: '2026-09-02T10:00:00+08:00',
    },
  },
}]))

const CALENDAR_LIST_MESSAGE = streamedMessage('calendar-list-review', 'run-calendar-list', hostToolParts([{
  name: 'calendar.list',
  args: { from: '2026-09-02T00:00:00+08:00', to: '2026-09-09T00:00:00+08:00' },
  result: {
    status: 'completed',
    value: [
      {
        id: 'event-review-1', companyId: 'company-review', createdBy: REVIEWER.id,
        kind: 'personal', title: '线性代数错题复盘', description: '复盘向量空间错题',
        assigneeId: null, targetConversationId: null, agentPrompt: null,
        startAt: '2026-09-04T19:30:00+08:00', endAt: '2026-09-04T20:15:00+08:00',
        allDay: false, recurrence: null, status: 'active', lastFiredAt: null,
        reminderMinutesBefore: 15, reminderChannel: 'toast', isPrivate: true,
        createdAt: '2026-09-02T10:00:00+08:00', updatedAt: '2026-09-02T10:00:00+08:00',
      },
      {
        id: 'event-review-2', companyId: 'company-review', createdBy: REVIEWER.id,
        kind: 'personal', title: '线性映射自测', description: '完成一组迁移练习',
        assigneeId: null, targetConversationId: null, agentPrompt: null,
        startAt: '2026-09-06T09:00:00+08:00', endAt: '2026-09-06T09:45:00+08:00',
        allDay: false, recurrence: null, status: 'active', lastFiredAt: null,
        reminderMinutesBefore: 15, reminderChannel: 'toast', isPrivate: true,
        createdAt: '2026-09-02T10:00:00+08:00', updatedAt: '2026-09-02T10:00:00+08:00',
      },
    ],
  },
}]))

const TIMELINE_MESSAGE = streamedMessage('timeline-review', 'run-timeline', hostToolParts([
  { name: 'research.search', args: { query: '提取练习反馈研究', limit: 5 }, result: { status: 'completed', value: { count: 5 } } },
  { name: 'memory.recall', args: { query: '提取练习的既有学习记录' }, result: { status: 'completed', value: { count: 3 } } },
  { name: 'knowledge.add_url', args: { title: '提取练习', url: 'https://示例.中国/提取练习' }, result: { status: 'completed', value: { sourceId: 'source-review' } } },
  { name: 'documents.create', args: { title: '复习提纲', body: '# 复习提纲' }, result: { status: 'completed', value: { documentId: 'document-review' } } },
  { name: 'calendar.create', args: { title: '线性代数复习', at: '2026-09-04T19:30:00+08:00' }, result: { status: 'completed', value: { eventId: 'event-review' } } },
]))

const CARD_MESSAGES = [
  ...convertEnvelopeBatch(PERSISTED_ENVELOPES, { participants: PARTICIPANTS, meId: REVIEWER.id }),
  SCORE_MESSAGE,
  CALENDAR_VIEW_MESSAGE,
  CALENDAR_LIST_MESSAGE,
  TIMELINE_MESSAGE,
]

const REVIEW_BUBBLES = [
  '我先确认这一项。',
  '这张卡片已经按当前协议整理好，请检查信息层级和交互状态。',
  '我再补充一段更长的说明，用来观察气泡换行、卡片前后间距，以及连续消息分组时头像和操作栏的位置是否稳定。',
] as const

function reviewBubble(cardIndex: number, bubbleIndex: number, body: string) {
  return convertEnvelope(envelope({
    version: 1,
    kind: 'text',
    clientMsgNo: `review-dialogue-${cardIndex}-${bubbleIndex}`,
    body,
    refs: { agentId: AGENT.id },
  }), { participants: PARTICIPANTS, meId: REVIEWER.id })
}

const REVIEW_MESSAGES = projectMessageGroups([
  ...CARD_MESSAGES.flatMap((message, cardIndex) => [
    ...REVIEW_BUBBLES.slice(0, 2).map((body, index) => reviewBubble(cardIndex, index, body)),
    message,
    reviewBubble(cardIndex, 2, REVIEW_BUBBLES[2]),
  ]),
  ...REVIEW_BUBBLES.map((body, index) => reviewBubble(-1, index, body)),
])

function ReviewRuntime({ children }: { children: ReactNode }) {
  const runtime = useExternalStoreRuntime<ThreadMessage>({
    messages: REVIEW_MESSAGES,
    isRunning: false,
    onNew: async () => {},
    onCancel: async () => {},
    onAddToolResult: async () => {},
    onRespondToToolApproval: async () => {},
  })
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}

function ProtocolCatalog() {
  const actionCount = HOST_PROTOCOL.reduce((total, [, , methods]) => total + methods.length, 0)
  return (
    <aside className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pe-2">
      <section className="rounded-2xl border border-border/70 bg-card p-4">
        <p className="text-sm font-semibold">主机桥接协议第一版</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {HOST_PROTOCOL.length} 个命名空间 · {actionCount} 个操作 · 模型唯一可见工具为交互式编程工具
        </p>
      </section>
      <section className="rounded-2xl border border-border/70 bg-card p-4">
        <p className="mb-3 text-sm font-semibold">协议 → 原生界面</p>
        <div className="grid gap-2">
          {CARD_ROUTES.map(([protocol, protocolLabel, surface]) => (
            <div key={protocol} data-protocol={protocol} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">{protocolLabel}</span>
              <span className="rounded-full bg-muted px-2 py-1 font-medium">{surface}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-border/70 bg-card p-4">
        <p className="mb-2 text-sm font-semibold">全部主机操作</p>
        <div className="grid gap-1">
          {HOST_PROTOCOL.map(([namespace, namespaceLabel, methods]) => (
            <details key={namespace} data-namespace={namespace} className="rounded-xl px-2 py-1 open:bg-muted/40">
              <summary className="cursor-pointer py-1 text-xs font-medium">
                {namespaceLabel} <span className="text-muted-foreground">（{methods.length}）</span>
              </summary>
              <div className="flex flex-wrap gap-1 pb-2 pt-1">
                {methods.map(([method, methodLabel]) => <span key={method} data-method={method} className="rounded-md bg-background px-1.5 py-1 text-[10px] text-muted-foreground">{methodLabel}</span>)}
              </div>
            </details>
          ))}
        </div>
      </section>
    </aside>
  )
}

function App() {
  const [paletteIndex, setPaletteIndex] = useState(0)
  const palette = CHAT_PALETTES[paletteIndex]!
  return (
    <main className="chat-review min-h-screen bg-background text-foreground" data-chat-palette={palette.id}>
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-base font-semibold tracking-tight">灵犀循环主机协议 · 原生卡片审查</h1>
            <p className="text-xs text-muted-foreground">生产协议转换器 + 助手数据流累加器 + 对话消息组件</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-2 rounded-lg bg-card px-3 text-xs shadow-sm"
              onClick={() => setPaletteIndex((current) => (current + 1) % CHAT_PALETTES.length)}
              aria-label={`切换卡片配色，当前为${palette.label}`}
            >
              <span className="review-palette-swatch" aria-hidden />
              卡片配色：{palette.label} · {paletteIndex + 1}/{CHAT_PALETTES.length}
            </Button>
            <ThemeToggle className="size-9 shrink-0 border border-border bg-card p-0 text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground" />
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <ProtocolCatalog />
        <section className="min-w-0">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">真实对话渲染</h2>
            <p className="mt-1 text-xs text-muted-foreground">所有示例先经过生产协议转换；卡片直接引用当前项目源码。</p>
          </div>
          <div className="assistant-ui-scope overflow-hidden rounded-3xl border border-border/70 bg-card py-4 shadow-sm">
            <ReviewRuntime>
              <ThreadPrimitive.Root className="aui-thread-root min-h-0">
                <ThreadPrimitive.Viewport className="flex min-h-0 flex-col">
                  <ThreadPrimitive.Messages components={{ Message: ConversationMessage }} />
                  <div className="flex w-full shrink-0 justify-center px-3 py-1.5">
                    <AgentStatus state="working" label="智能助教 · 正在切换教学模式" role="status" />
                  </div>
                </ThreadPrimitive.Viewport>
              </ThreadPrimitive.Root>
            </ReviewRuntime>
          </div>
        </section>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<AppThemeProvider><App /></AppThemeProvider>)
