// Run with npm run dev, then open /scripts/conversation-design-check.html.
// Failure cases: unequal/clipped avatars; menu overlays draft or leaves viewport;
// lost caret, draft, mention chips, or focus; accidental send; broken upload/cancel/
// failure or poll shortcuts; preview decoration suppresses keyboard focus.
// Uses real UI/runtime with local adapters only; no backend requests or messages.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, useAui, useAuiState, useExternalStoreRuntime, type AttachmentAdapter } from '@assistant-ui/react'
import { ConversationComposer } from '../src/features/chat/components/ConversationComposer'
import { ConversationListItemContent } from '../src/im/ConversationList'
import { ConversationHeader } from '../src/im/ConversationHeader'
import { CanvasPopover } from '../src/features/canvas/components/CanvasPopover'
import { useCanvas } from '../src/features/canvas/state'
import type { CanvasSnapshot } from '../src/features/canvas/contracts'
import { useParticipants } from '../src/features/agents/state'
import { useConversations } from '../src/features/conversations/store'
import { conversationsApi } from '../src/features/conversations/api'
import { useAuth } from '../src/stores/auth'
import { useSurface } from '../src/stores/surface'
import { TooltipProvider } from '../src/components/ui/tooltip'
import { Button } from '../src/components/ui/button'
import type { Conversation, Participant } from '../src/types'
import '../src/styles/globals.css'

document.body.style.overflow = 'auto'

const members: Participant[] = ['小林', '阿青', '陈老师', '小周', '小方', '小许'].map((name, i) => ({
  id: `member-${i + 1}`, name, kind: 'human', initial: name[0], avatarBg: '#687d9b', status: 'avail',
}))
members.push({ id: 'agent', name: '学习助教', kind: 'agent', initial: '助', avatarBg: '', status: 'avail' })
const conversations: Conversation[] = [1, 2, 3, 6, 0].map((n, i) => ({
  id: `check-${i}`, kind: n === 1 ? 'direct' : 'group', title: n ? `${n} 位成员的对话` : '成员暂未加载',
  members: members.slice(0, n).map(p => p.id), leaderId: null, lastAt: '刚刚', lastAtIso: '', preview: '一起讨论接下来的学习安排', unread: n > 1 ? 3 : 0,
}))
conversations.push({ ...conversations[0], id: 'check-agent', title: '学习助教', members: ['agent'] })
useAuth.setState({ user: { id: 'self', name: '我', email: 'local@example.invalid' } })
useParticipants.setState({ byId: Object.fromEntries(members.map(p => [p.id, p])), loaded: true })
useConversations.setState({ list: conversations })
conversationsApi.emitTyping = async () => ({ ok: true })

const snapshot: CanvasSnapshot = {
  id: 'canvas-check', title: '学习讨论画布', companyId: 'local', conversationId: 'check-3',
  triggerClientMsgNo: null, goal: '', initiatorAgentId: null, status: 'active', origin: 'local',
  summary: null, createdBy: 'self', createdAt: '', updatedAt: '', assignments: [], presence: [], comments: [], activity: [], reports: [],
  frames: [{ id: 'note', canvasId: 'canvas-check', type: 'markdown', title: '讨论要点', x: 0, y: 0, width: 420, height: 280,
    content: '# 讨论要点\n\n- 明确本周目标\n- 分享资料\n- 整理下一步行动', data: {}, revision: 1, createdBy: 'self', updatedBy: 'self', createdAt: '', updatedAt: '' }],
}
let canvasMode = 'content'
useCanvas.setState({ ensureForConversation: async () => {
  await pause(250)
  if (canvasMode === 'error') throw new Error('画布暂时无法加载，请重试。')
  const next = { ...snapshot, frames: canvasMode === 'empty' ? [] : snapshot.frames }
  useCanvas.setState({ previews: { [next.id]: next } })
  return next
} })
const attachments: AttachmentAdapter = {
  accept: '*',
  async *add({ file }) {
    const base = { id: crypto.randomUUID(), name: file.name, type: 'document' as const, contentType: file.type, file }
    yield { ...base, status: { type: 'running', reason: 'uploading', progress: 25 } }
    await pause(350)
    yield { ...base, status: file.name.startsWith('fail')
      ? { type: 'incomplete', reason: 'error', message: '模拟上传失败' }
      : { type: 'requires-action', reason: 'composer-send' } }
  },
  async send(attachment) { return { ...attachment, status: { type: 'complete' }, content: [] } },
  async remove() {},
}
const pause = (ms = 180) => new Promise<void>(resolve => setTimeout(resolve, ms))
const element = (selector: string) => {
  const node = document.querySelector<HTMLElement>(selector)
  if (!node) throw new Error(`缺少元素：${selector}`)
  return node
}
const clickText = (text: string) => {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.startsWith(text))
  if (!button) throw new Error(`缺少按钮：${text}`)
  button.click()
}
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
let sentText = ''

function Checks() {
  const aui = useAui()
  const draft = useAuiState(s => s.composer.text)
  const [results, setResults] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  async function run() {
    const report: string[] = []
    sentText = ''
    setRunning(true)
    try {
      const rows = [...document.querySelectorAll<HTMLElement>('[data-check-row]')]
      const boxes = rows.map(row => row.firstElementChild!.getBoundingClientRect())
      assert(boxes.every(box => Math.abs(box.width - boxes[0].width) < 1 && box.width === box.height), '头像占位必须等宽且为正方形')
      assert(rows[2].textContent?.includes('+1') && rows[3].textContent?.includes('+4'), '群头像人数不正确')
      assert(getComputedStyle(element('[data-check-row] [aria-label="3 条未读消息"]')).boxShadow !== 'none', '未读数字缺少外围轮廓')
      report.push('通过：单人、助教和 2/3/6 人群头像占位一致，人数正确')
      aui.composer().setText('第一行 @member-1\n第二行正文')
      await pause()
      const editor = element('[contenteditable="true"]')
      editor.focus()
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
      let textNode: Node | null
      while ((textNode = walker.nextNode()) && !textNode.textContent?.includes('第二行正文')) {}
      assert(textNode, '多行草稿未出现')
      const range = document.createRange()
      range.setStart(textNode!, 3); range.collapse(true)
      window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
      await pause()
      const plus = element('button[aria-label="添加"]')
      plus.click(); await pause()
      const menu = element('[role="dialog"][aria-label="添加"]')
      await Promise.all(menu.getAnimations().map(animation => animation.finished))
      const rect = menu.getBoundingClientRect(), composer = element('.chat-composer').getBoundingClientRect()
      assert(Math.abs(rect.width - composer.width) < 1 && Math.abs(rect.left - composer.left) < 1 && Math.abs(composer.top - rect.bottom - 8) < 2, `菜单必须在整个输入框上方 8px，等宽且左对齐：${JSON.stringify({ width: rect.width, composerWidth: composer.width, left: rect.left, composerLeft: composer.left, gap: composer.top - rect.bottom })}`)
      assert(rect.left >= 0 && rect.right <= innerWidth, '菜单超出视口')
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await pause()
      assert(document.activeElement === plus, 'Escape 关闭未恢复加号焦点')
      report.push('通过：菜单定位、视口边界及 Escape 焦点恢复')
      plus.click(); await pause(); clickText('提及成员'); await pause()
      assert(document.activeElement === editor, '提及时编辑器未获取焦点')
      assert(aui.composer().getState().text === '第一行 @member-1\n第二行 @正文', '提及触发符未保留原光标、草稿或已有提及')
      const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(node => node.textContent?.includes('阿青'))
      assert(option, '现有成员选择列表未打开'); option!.click(); await pause()
      assert(editor.querySelectorAll('[data-directive-id]').length === 2, '已有或新提及未显示为标签')
      assert(sentText === '', '选择提及意外发送消息')
      element('button[aria-label="发送"]').click(); await pause()
      assert(sentText.includes('@member-1') && sentText.includes('@member-2') && sentText.includes('正文'), '发送丢失提及或正文')
      report.push('通过：原光标插入、已有提及保留、选择成员不误发送、发送序列化')
      aui.composer().setText('投票前的草稿'); await pause()
      plus.click(); await pause(); clickText('发起投票'); await pause()
      assert(document.activeElement === element('input[aria-label="投票问题"]'), '投票问题未自动聚焦')
      element('button[aria-label="取消投票"]').click(); await pause()
      assert(aui.composer().getState().text === '投票前的草稿', '取消投票丢失草稿')
      assert(document.activeElement === element('[contenteditable="true"]'), '取消投票未恢复输入焦点')
      report.push('通过：投票打开、取消、草稿与焦点恢复')
      const nativeClick = HTMLInputElement.prototype.click
      try {
        for (const filename of [null, 'notes.txt', 'fail.txt']) {
          let pickerOpened = false
          HTMLInputElement.prototype.click = function () {
            if (this.type !== 'file') return nativeClick.call(this)
            pickerOpened = true
            if (!filename) { this.dispatchEvent(new Event('cancel')); return }
            const transfer = new DataTransfer()
            transfer.items.add(new File(['local check'], filename, { type: 'text/plain' }))
            this.files = transfer.files
            this.dispatchEvent(new Event('change', { bubbles: true }))
          }
          element('button[aria-label="添加"]').click(); await pause(); clickText('上传文件'); await pause(500)
          assert(pickerOpened, '未复用文件选择入口')
          if (filename) {
            assert(element('[aria-label="待发送附件"]').textContent?.includes(filename), `未显示所选文件 ${filename}：${JSON.stringify(aui.composer().getState().attachments.map(file => ({ name: file.name, status: file.status })))}`)
            if (filename.startsWith('fail')) assert(element('[aria-label="待发送附件"]').textContent?.includes('模拟上传失败'), '未显示上传失败')
            element(`button[aria-label="移除 ${filename}"]`).click(); await pause()
          } else assert(aui.composer().getState().attachments.length === 0, '取消选择产生了附件')
        }
      } finally { HTMLInputElement.prototype.click = nativeClick }
      report.push('通过：文件选择、取消、上传完成/失败与移除（本地适配器）')
      element('[data-canvas-popover-trigger]').click(); await pause(450)
      const preview = element('.canvas-preview-shell .canvas-preview')
      assert(['none', 'normal'].includes(getComputedStyle(preview, '::before').content) && ['none', 'normal'].includes(getComputedStyle(preview, '::after').content), '画布预览仍有手绘外框')
      element('.canvas-preview-shell').click(); await pause()
      assert(useSurface.getState().surface?.kind === 'canvas', '预览未打开完整画布')
      useSurface.getState().closeSurface()
      report.push('通过：缩略图无手绘外框，点击打开画布')
    } catch (error) { report.push(`失败：${error instanceof Error ? error.message : String(error)}`) }
    setResults(report); setRunning(false)
  }
  return <div className="grid gap-2 p-3 text-xs">
    <Button onClick={() => void run()} disabled={running}>{running ? '检查中…' : '运行回归检查'}</Button>
    <p>仅本地 UI / runtime；上传、画布与正在输入使用本地适配器。投票仅检查打开和取消。</p>
    <output aria-label="当前草稿" className="whitespace-pre-wrap">{draft}</output>
    <pre aria-label="回归结果" className="whitespace-pre-wrap">{results.join('\n')}</pre>
    {results.length > 0 && <Button variant="outline" onClick={() => {
      const url = URL.createObjectURL(new Blob([JSON.stringify({ viewport: [innerWidth, innerHeight], theme: document.documentElement.dataset.theme, results }, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a'); link.href = url; link.download = 'conversation-design-check.json'; link.click(); URL.revokeObjectURL(url)
    }}>下载回归结果</Button>}
  </div>
}

function App() {
  const [narrow, setNarrow] = useState(false)
  const [canvasKey, setCanvasKey] = useState(0)
  const runtime = useExternalStoreRuntime({ messages: [], onNew: async message => {
    sentText = message.content.filter(part => part.type === 'text').map(part => part.text).join('')
  }, adapters: { attachments } })
  return <TooltipProvider><AssistantRuntimeProvider runtime={runtime}>
    <div className="flex flex-wrap items-center gap-3 p-3 text-sm">
      <Button variant="outline" onClick={() => { const dark = document.documentElement.classList.toggle('dark'); document.documentElement.dataset.theme = dark ? 'dark' : 'light' }}>切换浅深色</Button>
      <Button variant="outline" onClick={() => setNarrow(!narrow)}>切换窄屏</Button>
      <label>画布状态 <select aria-label="画布状态" onChange={event => { canvasMode = event.target.value; setCanvasKey(n => n + 1) }}>
        <option value="content">有内容</option><option value="empty">空画布</option><option value="error">加载失败</option>
      </select></label>
    </div>
    <main className="desktop-openmaus mx-auto overflow-hidden rounded-2xl border border-border bg-background text-foreground" style={{ width: narrow ? 'min(375px, 100%)' : 'min(1100px, 100%)' }}>
      <div className="grid" style={{ gridTemplateColumns: narrow ? '1fr' : '310px minmax(0, 1fr)' }}>
        <aside className="bg-sidebar p-2">{conversations.map(conversation => <div key={conversation.id} data-check-row className="flex items-center gap-2.5 p-2">
          <ConversationListItemContent conversation={conversation} variant={narrow ? 'mobile' : 'desktop'} />
        </div>)}</aside>
        <section className="flex min-w-0 flex-col">
          <ConversationHeader conversationId="check-3" variant={narrow ? 'mobile' : 'desktop'} actions={<CanvasPopover key={canvasKey} conversationId="check-3" />} />
          <div className="min-h-72 flex-1 p-5 text-sm text-muted-foreground">对话界面回归检查 · 可以直接操作下方输入框。</div>
          <ConversationComposer conversationId="check-3" compact={narrow} />
        </section>
      </div>
      <Checks />
    </main>
  </AssistantRuntimeProvider></TooltipProvider>
}
const root = createRoot(document.getElementById('root')!)
root.render(<App />)
import.meta.hot?.dispose(() => root.unmount())
