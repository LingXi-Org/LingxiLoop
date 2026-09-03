import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import { agentsApi } from '../api'
import type { AgentInput } from '../contracts'
import { Avatar } from '@/components/Avatar'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { useConversations } from '@/features/conversations/store'
import { userFacingError } from '@/lib/userFacingError'
import { useParticipants } from '../state'
import type { AgentCapability, Participant } from '@/types'

const CAPABILITY_OPTIONS: Array<{ id: AgentCapability; label: string; description: string }> = [
  { id: 'canvas', label: '共享画布', description: '查看并修改工作区共享画布与内容卡片' },
  { id: 'web', label: '网页研究', description: '搜索和读取公开网页' },
  { id: 'files', label: '文件', description: '读写工作区与交付文件' },
  { id: 'email', label: '邮件', description: '起草邮件；实际发送仍受审批策略约束' },
  { id: 'documents', label: '协作文档', description: '创建、读取和编辑协作文档' },
  { id: 'calendar', label: '日历', description: '访问日历和日程相关能力' },
  { id: 'knowledge', label: '知识库', description: '检索并使用当前学习区的知识资料' },
  { id: 'learning', label: '教学', description: '在课程范围内规划学习任务、记录证据并提出形成性评价' },
]
const DEFAULT_CAPABILITIES: AgentCapability[] = ['canvas', 'web', 'files', 'email', 'documents', 'knowledge']

interface Props {
  /** if provided, edit mode; otherwise create mode */
  agent: Participant | null
  onClose: () => void
}

export function AgentEditor({ agent, onClose }: Props) {
  const editing = agent !== null
  const [name, setName] = useState(agent?.name ?? '')
  const [role, setRole] = useState(agent?.role ?? '')
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '')
  const [bio, setBio] = useState(agent?.bio ?? '')
  const [capabilities, setCapabilities] = useState<AgentCapability[]>(agent?.capabilities ?? DEFAULT_CAPABILITIES)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    setErr(null)
    setBusy(true)
    try {
      const payload: AgentInput = {
        name, role, systemPrompt, bio, capabilities,
      }
      if (editing) {
        await agentsApi.updateAgent(agent!.id, payload)
      } else {
        // No `id` field on create — server slugifies it from `name`
        // and guarantees global uniqueness.
        await agentsApi.createAgent(payload)
      }
      await useParticipants.getState().load()
      await useConversations.getState().reload()
      onClose()
    } catch (e) {
      setErr(userFacingError(e, '智能助教保存失败，请稍后重试。'))
    } finally {
      setBusy(false)
    }
  }

  const initial = (name || agent?.id || '?').charAt(0).toUpperCase()

  const previewId = agent?.id ?? (name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'agent-preview')
  const previewParticipant: Participant = {
    id: previewId, kind: 'agent', name: name || '智能助教', role, initial,
    avatarBg: 'transparent', status: 'avail',
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: 'color-mix(in srgb, var(--foreground) 55%, transparent)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="bg-cloud rounded-[18px] shadow-pop w-full max-w-[560px] max-h-[90vh] flex flex-col overflow-hidden"
        style={{ border: '1px solid var(--ink-100)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-ink-100 flex items-center gap-3 shrink-0">
          <Avatar p={previewParticipant} size={48} animated={false} />
          <div className="flex-1">
            <h2 className="font-display font-medium text-[20px] tracking-tight">
              {editing ? `编辑 ${agent!.name}` : "新建智能助教"}
            </h2>
            <div className="text-[12.5px] text-ink-500 italic font-display">
              {editing ? "调整该队友的行为方式。" : "从头开始​​定义一个新队友。"}
            </div>
          </div>
          <Button
            onClick={onClose}
            className="w-8 h-8 rounded-full grid place-items-center text-ink-500 hover:bg-sky2-50 hover:text-ink-900 transition"
            aria-label="关闭"
          >×</Button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          <Field label="名称" hint="智能助教在界面中的显示名称；@提及标识会自动生成。">
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：概念导师"
            />
          </Field>

          <Field label="任务职责" hint="系统会按任务分配职责，智能助教不能自行提高权限。">
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['协调者', '维护学习任务板，并分派完成任务所需的最小团队'],
                ['专业执行者', '只完成分配的专业子问题，并提交结构化报告'],
                ['独立复核者', '必须独立于产出角色，执行反例检查和证据裁决'],
                ['汇总者', '只读取已保存的报告，保留冲突并形成最终汇总'],
              ].map(([title, description]) => <div key={title} className="rounded-[10px] border border-ink-100 bg-white px-3 py-2.5"><div className="text-[12px] font-semibold text-ink-900">{title}</div><div className="mt-1 text-[11px] leading-4 text-ink-500">{description}</div></div>)}
            </div>
          </Field>

          <Field label="角色说明" hint="显示在名称旁，用简短文字说明该智能助教的职责。">
            <Input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="例如：概念教学与理解检查"
            />
          </Field>

          <Field label="行为提示词" hint="描述智能助教的语气、原则和工作边界。请用第二人称“你”来书写。">
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              placeholder="你先核对事实，再给出清晰结论。表达直接、友好，不夸大不确定信息。"
              className="font-display italic"
              style={{ minHeight: 110 }}
            />
          </Field>

          <Field label="简介" hint="可选，显示在智能助教资料卡上。">
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              placeholder="用一句话说明这个智能助教最擅长的事情。"
            />
          </Field>

          <Field label="运行环境" hint="所有学习智能助教使用相同的安全运行环境与模型配置。">
            <div className="rounded-[10px] bg-sky2-50 px-3 py-2 text-[12.5px] text-ink-700">
              LingxiLoop 智能助教安全运行环境
            </div>
          </Field>

          <Field label="能力与权限" hint="只允许该智能助教使用已勾选的能力；可随时撤销。高风险动作仍会单独请求批准。">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CAPABILITY_OPTIONS.map((option) => {
                const checked = capabilities.includes(option.id)
                return (
                  <label
                    key={option.id}
                    className="flex items-start gap-2.5 rounded-[10px] px-3 py-2.5 cursor-pointer transition"
                    style={{
                      border: checked ? '1px solid var(--skype)' : '1px solid var(--ink-100)',
                      background: checked ? 'var(--sky2-50)' : 'var(--cloud)',
                    }}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => setCapabilities((current) => checked
                        ? current.filter((capability) => capability !== option.id)
                        : [...current, option.id])}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-[12.5px] font-semibold text-ink-900">{option.label}</span>
                      <span className="block text-[11px] leading-[1.4] text-ink-500">{option.description}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            <div className="mt-2 rounded-[9px] border border-dashed border-ink-100 px-3 py-2 text-[11.5px] text-ink-500">
              + 更多能力可通过后续集成扩展
            </div>
          </Field>

          <Field label="趣味头像" hint="智能助教使用固定的趣味头像；颜色、形状与表情会随身份和状态变化。">
            <div className="flex items-center gap-3 rounded-[12px] border border-ink-100 bg-white px-4 py-3">
              <Avatar p={previewParticipant} size={72} animated={false} />
              <div className="text-[12.5px] leading-5 text-ink-500">无需上传或生成图片；同一智能助教在聊天、成员列表和管理界面保持一致。</div>
            </div>
          </Field>

          {err && (
            <div className="text-[12.5px] text-coral-deep bg-coral-soft py-2 px-3 rounded-lg">
              {err}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-ink-100 flex items-center gap-2 bg-paper shrink-0">
          <Button
            onClick={onClose}
            className="px-4 py-2 rounded-[9px] text-[12.5px] font-semibold text-ink-700 bg-cloud hover:bg-sky2-50 transition"
            style={{ border: '1px solid var(--ink-100)' }}
          >取消</Button>
          <div className="flex-1" />
          <Button
            onClick={submit}
            disabled={busy || !name.trim() || !systemPrompt.trim()}
            className="px-5 py-2 rounded-[9px] text-[12.5px] font-semibold text-white transition disabled:opacity-50"
            style={{
              background: 'var(--skype)',
              boxShadow: '0 4px 12px -3px color-mix(in srgb, var(--primary) 50%, transparent)',
            }}
          >
            {busy ? "正在保存…" : (editing ? "保存更改" : "创建智能助教")}
          </Button>
        </div>
      </div>

    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-bold tracking-wider uppercase text-ink-500 mb-1">{label}</label>
      {hint && <div className="text-[11.5px] text-ink-300 mb-1.5 font-display italic">{hint}</div>}
      {children}
    </div>
  )
}
