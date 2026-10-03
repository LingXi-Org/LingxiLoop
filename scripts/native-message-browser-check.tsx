// Browser acceptance without Playwright. Open on Vite, run, export JSON and capture the page.
// Failure cases: v2 filtering, reordered parts, terminal tools spinning, hidden approvals,
// partial args crashing cards, duplicate/failed submissions, nested writes and lost replay receipts.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, useExternalStoreRuntime, type ThreadMessage } from '@assistant-ui/react'
import { createRunView } from '@lyyzka/lingxios/ui'
import { ConversationThread } from '../src/features/chat/components/ConversationThread'
import { convertEnvelope } from '../src/features/chat/runtime/converter'
import { chatTransport } from '../src/features/chat/runtime/transport'
import { harnessApi } from '../src/features/chat/runtime/harness-api'
import { useParticipants } from '../src/features/agents/state'
import { useCanvas } from '../src/features/canvas/state'
import { usePresentations } from '../src/features/presentations/state'
import { useAuth } from '../src/stores/auth'
import { createNativeMessage, serializeMessage, deserializeMessage, DATA_NAMES } from '../src/lib/nativeMessage'
import '../src/styles/globals.css'

const now = '2026-10-02T00:00:00Z'
const participants = { agent: { id: 'agent', kind: 'agent' as const, name: '研究助手', initial: '助', avatarBg: 'transparent', status: 'avail' as const } }
useParticipants.setState({ byId: participants })
useAuth.setState({ user: { id: 'me', name: '测试用户', email: 'fixture@example.com', emailVerified: true, providers: [] } })
useCanvas.setState({ loadPreview: async () => undefined })
usePresentations.setState({ load: async () => undefined })
const counts = { questionnaire: 0, vote: 0, approval: 0, input: 0 }
let publish: (updater: (messages: ThreadMessage[]) => ThreadMessage[]) => void = () => {}
let failQuestionnaire = true
const delay = () => new Promise(resolve => setTimeout(resolve, 80))
const tool = (id: string, extra: Record<string, unknown> = {}) => ({ type: 'tool-call' as const, toolCallId: id, toolName: 'fixture.tool', args: {}, argsText: '{}', ...extra })
function assistant(id: string, content: ThreadMessage['content'], status: ThreadMessage['status'] = { type: 'complete', reason: 'stop' }, custom: Record<string, unknown> = {}) {
  return convertEnvelope({ channelId: 'fixture', channelType: 2, fromUid: 'agent', clientMsgNo: id, messageId: id, messageSeq: 0, timestamp: 1790899200,
    payload: createNativeMessage({ id, role: 'assistant', createdAt: now, content, status, custom }),
  }, { participants, meId: 'me' })
}
const data = (name: string, value: unknown) => ({ type: 'data' as const, name, data: value })
const question = { title: '选择学习方式', items: [{ name: 'mode', prompt: '你想如何学习？', required: true, choices: [{ value: 'practice', label: '练习验证' }] }] }
const initial: ThreadMessage[] = [
  assistant('mixed', [
    { type: 'text', text: '## 本周研究进展\n\n我们完成了资料梳理，以下是可核对的结果。\n\n| 项目 | 进度 |\n| --- | --- |\n| 证据整理 | 已完成 |\n| 方案验证 | 进行中 |' },
    { type: 'reasoning', text: '这是一段允许公开的推理摘要。', unstable_summary: '推理摘要', status: { type: 'running' } },
    { type: 'image', image: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="240"%3E%3Crect width="640" height="240" fill="%23e0e7ff"/%3E%3Ctext x="50" y="135" font-size="36" fill="%233730a3"%3EEvidence overview%3C/text%3E%3C/svg%3E', filename: '证据概览.svg' },
    { type: 'text', text: '图片后的说明，保持原始内容顺序。' },
    { type: 'source', sourceType: 'url', id: 'url', title: 'assistant-ui 文档', url: 'https://www.assistant-ui.com/docs' },
    { type: 'source', sourceType: 'document', id: 'doc', title: '课程参考资料', mediaType: 'application/pdf', filename: '课程参考.pdf' },
    { type: 'file', data: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=', sourceType: 'url', mimeType: 'audio/wav', filename: '讲解.wav' },
    { type: 'file', data: 'data:video/mp4;base64,AAAA', sourceType: 'url', mimeType: 'video/mp4', filename: '讲解.mp4' },
    { type: 'generative-ui', id: 'tree', spec: { root: { component: 'Card', props: { title: '动态组件树' }, children: [{ component: 'Text', props: { value: '白名单组件' } }] } } },
  ], { type: 'running' }),
  assistant('tools', [tool('one', { result: { status: 'completed' } }), tool('two', { result: { status: 'completed' } }),
    { type: 'text', text: '工具分组后的答复。' }]),
  assistant('partial', [tool('partial', { toolName: 'calendar.list', argsText: '{"query":"par' })], { type: 'running' }),
  assistant('cancelled', [tool('cancelled')], { type: 'incomplete', reason: 'cancelled' }),
  assistant('expired', [tool('expired', { approval: { id: 'expired', resolution: 'expired' } })]),
  assistant('denied', [tool('denied', { approval: { id: 'denied', approved: false } })]),
  assistant('approval', [tool('approval', { approval: { id: 'approval' } })], { type: 'requires-action', reason: 'tool-calls' }, { runId: 'approval', harnessControl: true }),
  assistant('spectator', [tool('spectator', { approval: { id: 'spectator' } })], { type: 'requires-action', reason: 'tool-calls' }, { runId: 'spectator', harnessControl: false }),
  assistant('options', [tool('options', { approval: { id: 'options', options: [{ id: 'forever', kind: 'allow-always', label: '永久允许', grants: ['example:*'] }] } })], { type: 'requires-action', reason: 'tool-calls' }, { runId: 'options', harnessControl: true }),
  assistant('run-input', [tool('input', { interrupt: { type: 'human', payload: { prompt: '请说明你想验证的问题' } } })], { type: 'requires-action', reason: 'interrupt' }, {
    runId: 'input', refs: { agentId: 'agent' }, harnessControl: true, controlPrincipalId: 'me',
    harness: { ...createRunView('input'), requestVersion: 1, lifecycle: 'waiting', artifacts: [] },
  }),
  assistant('nested', [tool('child', { result: { ok: true }, messages: [assistant('nested-question', [data('questionnaire', question)])] })]),
  assistant('question', [data('questionnaire', question)]),
  assistant('poll', [data('poll', { poll: { question: '选择资料格式', mode: 'single', options: [{ id: 'pdf', text: 'PDF 文档' }, { id: 'audio', text: '音频讲解' }] }, pollTallies: [] })]),
  assistant('recommendation', [data('recommendation', { title: '下一步建议', explanation: '先用一道题检查理解。', items: [{ name: 'next_step', prompt: '是否开始练习？', choices: [{ value: 'accept', label: '接受' }, { value: 'alternatives', label: '换一个' }] }] })]),
  assistant('cards', [
    data('handoff', { id: 'handoff', title: '交叉验证资料', fromAgentId: 'agent', toAgentId: 'agent', status: 'completed', updatedAt: now }),
    data('learning-mission', { missionId: 'mission', goal: '理解消息协议', status: 'ACTIVE', steps: [{ id: 'learn', description: '阅读原生协议', status: 'COMPLETED' }, { id: 'check', description: '验证历史回放', status: 'IN_PROGRESS' }] }),
    data('canvas', { canvasId: 'canvas', title: '研究画布', goal: '汇总证据', status: 'completed', updatedAt: now }),
    data('teacher-briefing', { dashboard: { id: 'stats', title: '学习进展', description: '本周', stats: [{ key: 'verified', label: '已验证知识点', value: 7 }] } }),
    data('presentation-artifact', { artifactId: 'deck', artifactKind: 'lecture_deck_html', title: '研究汇报' }),
    data('document-reference', { title: '证据文档', pages: 3, anchors: [{ page: 2, quote: '可核对的证据' }], activePage: 2 }),
    data('email', { id: 'mail', from: 'teacher@example.com', to: ['learner@example.com'], cc: [], subject: '本周学习总结', body: '已整理好 **学习资料**。', outcome: 'sent' }),
    data('tool-activity', { title: '整理资料', status: 'completed' }),
    data('citation-claims', { claims: [] }),
  ]),
  assistant('calendar', [tool('calendar', { toolName: 'calendar.list', result: { status: 'completed', value: { events: [{ id: 'event', title: '证据评审', startAt: now, allDay: false }], truncated: false } } })]),
  assistant('search', [tool('search', { toolName: 'research.search', result: { status: 'completed', sources: [{ title: '可核对的搜索结果', url: 'https://example.com/evidence', snippet: '这是用于验证的来源摘要。' }] } })]),
  assistant('score', [tool('score', { toolName: 'learning.propose_evaluation', result: { status: 'completed', value: { status: 'ACCEPTED', display: { demonstratedLevel: 3, rubricResults: [{ label: '证据充分', score: 3, weight: 1 }] } } } })]),
  assistant('invalid', [data('questionnaire', { items: [] }), { type: 'text', text: '异常卡片后的正文仍可阅读。' }]),
]

harnessApi.readApproval = async id => ({ id, summary: '创建一次证据评审', status: 'PENDING', action: { action: 'calendar.create' }, preview: { input: { title: '证据评审', startAt: now } } })
chatTransport.resolveApproval = async (id, decision) => {
  counts.approval++; await delay()
  publish(messages => messages.map(message => ({ ...message, content: message.content.map(part => part.type === 'tool-call' && part.approval?.id === id
    ? { ...part, approval: { ...part.approval, approved: decision === 'approved' }, result: { status: 'completed' } } : part) } as ThreadMessage)))
}
chatTransport.answerQuestionnaire = async (conversationId, questionId, answers) => {
  counts.questionnaire++; await delay()
  if (failQuestionnaire) { failQuestionnaire = false; throw new Error('验收中的可重试失败') }
  const id = 'reply-' + questionId
  const reply = convertEnvelope({ channelId: conversationId, channelType: 2, fromUid: 'me', clientMsgNo: id, messageId: id, messageSeq: 0, timestamp: 1790899200,
    payload: createNativeMessage({ id, role: 'user', createdAt: now, content: [{ type: 'text', text: '我的选择已提交。' }], custom: { replyToClientMsgNo: questionId, questionnaireReply: { questionId, answers } } }),
  }, { participants, meId: 'me' })
  publish(messages => [...messages, reply])
}
chatTransport.votePoll = async (id, optionIds) => {
  counts.vote++; await delay()
  publish(messages => messages.map(message => message.id !== id ? message : { ...message, content: message.content.map(part => part.type === 'data' && part.name === 'poll'
    ? { ...part, data: { ...part.data as object, pollTallies: optionIds.map(optionId => ({ optionId, count: 1, voterIds: ['me'] })) } } : part) } as ThreadMessage))
}
chatTransport.continueRun = async target => {
  counts.input++; await delay()
  publish(messages => messages.map(message => message.metadata.custom.runId !== target.runId ? message : { ...message, status: { type: 'complete', reason: 'stop' },
    content: message.content.map(part => { if (part.type !== 'tool-call') return part; const { interrupt: _interrupt, ...rest } = part; return { ...rest, result: { status: 'completed' } } }) } as ThreadMessage))
}

function App() {
  const [messages, setMessages] = useState(initial), [revision, setRevision] = useState(0)
  const [result, setResult] = useState<Record<string, unknown>>({ status: '待运行' })
  const [theme, setTheme] = useState('light')
  publish = setMessages
  const runtime = useExternalStoreRuntime({ messages, isRunning: messages.some(message => message.status?.type === 'running'), onNew: async () => {} })
  const paint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  const check = (ok: unknown, label: string) => { if (!ok) throw new Error(label) }
  const row = (id: string) => document.querySelector<HTMLElement>('[data-msg-id="' + id + '"]')!
  const button = (root: Element, label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === label)!
  async function until(predicate: () => boolean, label: string) {
    const deadline = performance.now() + 5000
    while (!predicate()) { check(performance.now() < deadline, label); await new Promise(resolve => setTimeout(resolve, 30)) }
  }
  async function run() {
    const checks: string[] = []
    try {
      Object.assign(counts, { questionnaire: 0, vote: 0, approval: 0, input: 0 }); failQuestionnaire = true
      setMessages(initial); setRevision(value => value + 1); setResult({ status: '运行中' }); await paint()
      check(row('mixed')?.textContent?.includes('本周研究进展'), '真实线程未展示 v2 消息')
      const order = [...row('mixed').querySelectorAll('[data-native-part]')].slice(0, 4).map(node => node.getAttribute('data-native-part'))
      check(order.join(',') === 'text,reasoning,image,text', '混合内容顺序变化'); checks.push('真实线程 v2 / 混合顺序')
      check(row('mixed').querySelector('audio[controls]') && row('mixed').querySelector('video[controls]'), '媒体控件缺失')
      row('mixed').querySelector('video')!.dispatchEvent(new Event('error')); await paint()
      check(row('mixed').textContent?.includes('媒体预览不可用'), '媒体错误没有回退提示')
      check(row('mixed').textContent?.includes('课程参考资料') && row('mixed').textContent?.includes('白名单组件'), '来源或生成式组件丢失')
      checks.push('图片 / 音视频 / URL 与文档来源 / 生成式 UI')
      check(row('mixed').querySelector('[data-slot="reasoning-trigger"]')?.getAttribute('aria-expanded') === 'true', '流式推理未展开')
      const reasoning = row('mixed').querySelector<HTMLButtonElement>('[data-slot="reasoning-trigger"]')!
      reasoning.click(); await paint(); check(reasoning.getAttribute('aria-expanded') === 'false', '推理无法手动收起')
      check(row('tools').querySelectorAll('[data-slot="tool-group-root"]').length === 1, '连续工具未分组')
      check(row('cancelled').textContent?.includes('已取消') && !row('cancelled').textContent?.includes('执行中'), '取消仍显示运行')
      check(row('partial').textContent?.includes('正在读取日历'), '参数增量没有加载状态')
      check(row('expired').textContent?.includes('审批已过期') && row('denied').textContent?.includes('已拒绝'), '审批终态丢失')
      check(row('invalid').textContent?.includes('暂时无法显示') && row('invalid').textContent?.includes('仍可阅读'), '异常未局部隔离')
      checks.push('分组 / 流式参数 / 取消 / 终态 / 局部错误隔离')
      row('nested').querySelector('summary')!.click(); await paint()
      for (const id of ['spectator', 'options', 'expired', 'denied', 'nested']) {
        check(![...row(id).querySelectorAll<HTMLButtonElement>('button')].some(button => !button.matches(':disabled') && /^(批准并继续|拒绝|提交|永久允许)$/.test(button.textContent?.trim() ?? '')), '不应可操作：' + id)
      }
      checks.push('非控制者 / 未支持选项 / 已结束审批 / 嵌套只读')
      await until(() => Boolean(button(row('approval'), '批准并继续')), '审批详情未加载')
      button(row('approval'), '批准并继续').click(); button(row('approval'), '批准并继续')?.click()
      await until(() => row('approval').textContent?.includes('已批准') === true, '审批未更新')
      check(counts.approval === 1, '审批重复提交'); checks.push('审批与防重复')
      button(row('question'), '练习验证').click(); await paint()
      button(row('question'), '提交').click(); button(row('question'), '提交')?.click()
      await until(() => Boolean(row('question').querySelector('[role="alert"]')), '失败未展示')
      check(counts.questionnaire === 1, '问卷重复提交')
      button(row('question'), '提交').click()
      await until(() => row('question').textContent?.includes('已提交') === true, '重试未完成'); check(counts.questionnaire === 2, '重试次数错误')
      const option = row('poll').querySelector<HTMLInputElement>('input[value="pdf"]')!; option.click(); await paint()
      button(row('poll'), '提交投票').click(); button(row('poll'), '提交投票')?.click()
      await until(() => row('poll').textContent?.includes('已提交投票') === true, '投票未完成'); check(counts.vote === 1, '投票重复提交')
      checks.push('问卷失败重试 / 投票 / 防重复提交')
      const input = row('run-input').querySelector<HTMLInputElement>('input')!
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '验证历史回放')
      input.dispatchEvent(new Event('input', { bubbles: true })); await paint()
      button(row('run-input'), '提交').click()
      await until(() => counts.input === 1, '补充输入未提交'); await delay(); checks.push('补充输入')
      const present = new Set(initial.flatMap(message => message.content.flatMap(part => part.type === 'data' ? [part.name] : [])))
      check(DATA_NAMES.every(name => present.has(name)), '未覆盖全部业务名称')
      for (const id of ['cards', 'calendar', 'search', 'score', 'recommendation']) check(!row(id).querySelector('[role="alert"]'), '业务卡片显示失败：' + id)
      checks.push('全部业务卡片')
      setMessages(current => current.map(message => deserializeMessage(serializeMessage({ ...message,
        ...(message.role === 'assistant' && message.status.type === 'running' ? { status: { type: 'complete', reason: 'stop' } } : {}),
        content: message.content.map(part => part.type === 'reasoning' ? { ...part, status: { type: 'complete' } } : part),
      } as ThreadMessage)))); setRevision(value => value + 1); await paint()
      check(row('question').textContent?.includes('已提交') && row('poll').textContent?.includes('已提交投票'), '回放丢失回执')
      check(row('mixed').querySelector('[data-slot="reasoning-trigger"]')?.getAttribute('aria-expanded') === 'false', '历史推理未收起')
      check(row('tools').querySelectorAll('time').length === 1, '时间戳重复或缺失'); checks.push('JSON 回放 / 持久回执 / 单次时间戳')
      check(document.documentElement.scrollWidth <= innerWidth + 1, '页面横向溢出'); checks.push('当前视口无横向溢出')
      setResult({ status: '通过', checks, counts, width: innerWidth, theme, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, at: new Date().toISOString() })
    } catch (error) { setResult({ status: '失败', error: String(error), checks, counts }) }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'native-message-browser-result.json'; link.click(); URL.revokeObjectURL(url)
  }
  return <main className="mx-auto grid h-dvh max-w-4xl grid-rows-[auto_auto_minmax(0,1fr)] gap-3 p-3 sm:p-6">
    <header className="flex flex-wrap items-center gap-3"><h1 className="text-lg font-semibold">消息与卡片验收</h1>
      <button className="rounded border px-3 py-1" onClick={() => void run()}>运行验收</button><button className="rounded border px-3 py-1" onClick={download}>导出结果</button>
      <button className="rounded border px-3 py-1" onClick={() => { const next = theme === 'light' ? 'dark' : 'light'; setTheme(next); document.documentElement.classList.toggle('dark', next === 'dark') }}>切换主题</button></header>
    <pre id="native-result" role="status" className="max-h-28 overflow-auto rounded-lg bg-muted p-2 text-xs whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
    <div id="native-content" className="min-h-0 overflow-hidden rounded-xl border"><AssistantRuntimeProvider runtime={runtime} key={revision}>
      <ConversationThread conversationId="fixture" threadRootId="fixture-root" readOnly />
    </AssistantRuntimeProvider></div>
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
