import { DEFAULT_AGENT_CAPABILITIES } from '@/lib/agentCapabilities'
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

const CAPABILITY_DETAILS: Record<(typeof DEFAULT_AGENT_CAPABILITIES)[number], { label: string; description: string }> = {
  'canvas': { label: '共享画布', description: '查看并修改工作区共享画布与内容卡片' },
  'web': { label: '网页研究', description: '搜索和读取公开网页' },
  'files': { label: '文件', description: '读取已选附件并生成交付文件' },
  'email': { label: '邮件', description: '起草邮件；发送前仍需你确认' },
  'documents': { label: '协作文档', description: '创建、读取和编辑协作文档' },
  'calendar': { label: '日历', description: '查看和安排日程' },
  'knowledge': { label: '知识库', description: '检索并使用当前学习区的知识资料' },
  'learning': { label: '教学', description: '规划课程任务，跟进学习成果并提供反馈' },
  'handoffs': { label: '协作交接', description: '与同一会话中的其他智能助教分工并查看进展' },
  'routines': { label: '定时任务', description: '安排定时任务并查看执行记录' },
}
const CAPABILITY_OPTIONS = DEFAULT_AGENT_CAPABILITIES.map(id => ({ id, ...CAPABILITY_DETAILS[id] }))


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
  const [capabilities, setCapabilities] = useState<AgentCapability[]>(agent?.capabilities ?? [...DEFAULT_AGENT_CAPABILITIES])
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
              {editing ? "调整该队友的行为方式。" : "设置新队友的职责和工作方式。"}
            </div>
          </div>
          <Button
            onClick={onClose}
            className="w-8 h-8 rounded-full grid place-items-center text-ink-500 hover:bg-sky2-50 hover:text-ink-900 transition"
            aria-label="关闭"
          >×</Button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          <Field label="名称" hint="其他成员可在对话中用这个名称找到并提及它。">
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field label="任务职责" hint="选择它在团队任务中的分工；角色不会增加它可使用的功能。">
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['协调者', '拆分任务并分配给合适的团队成员'],
                ['专业执行者', '处理分配的任务并说明结论'],
                ['独立复核者', '检查结论与证据，寻找遗漏'],
                ['汇总者', '整理团队成果并说明不同意见'],
              ].map(([title, description]) => <div key={title} className="rounded-[10px] border border-ink-100 bg-white px-3 py-2.5"><div className="text-[12px] font-semibold text-ink-900">{title}</div><div className="mt-1 text-[11px] leading-4 text-ink-500">{description}</div></div>)}
            </div>
          </Field>

          <Field label="角色说明">
            <Input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </Field>

          <Field label="行为指引" hint="写下你希望它如何沟通、分析问题和完成任务。">
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              className="font-display italic"
              style={{ minHeight: 110 }}
            />
          </Field>

          <Field label="简介" hint="介绍它擅长什么，帮助团队找到合适的伙伴。">
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
            />
          </Field>

          <Field label="能力与权限" hint="仅启用所选功能；涉及敏感操作时，智能助教仍会先征求你的同意。">
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
