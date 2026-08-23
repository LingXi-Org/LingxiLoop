import { useEffect, useState } from 'react'
import { type AgentInput, api } from '@/api/client'
import { Input } from '@/components/Input'
import { TextArea } from '@/components/TextArea'
import { useConversations } from '@/stores/conversations'
import { useParticipants } from '@/stores/participants'
import type { AgentCapability, Participant } from '@/types'

const PALETTE = [
  '#FFB088', '#FFD9D2', '#FFB7AF', '#F4B740',
  '#7C5CFF', '#A593FF', '#4FC2F4', '#41B5DC',
  '#4FC2A1', '#6EC56A', '#E9A0E9', '#FF7AB6',
]

const CAPABILITY_OPTIONS: Array<{ id: AgentCapability; label: string; description: string }> = [
  { id: 'canvas', label: 'Canvas', description: '查看并修改工作区共享画布与 Frame' },
  { id: 'web', label: 'Web Research', description: '搜索和读取公开网页' },
  { id: 'files', label: 'Files', description: '读写工作区与交付文件' },
  { id: 'email', label: 'Email', description: '起草邮件；发送仍需审批策略' },
  { id: 'documents', label: 'Documents', description: '创建、读取和编辑协作文档' },
  { id: 'calendar', label: 'Calendar', description: '访问日历和日程相关能力' },
]
const DEFAULT_CAPABILITIES: AgentCapability[] = ['canvas', 'web', 'files', 'email', 'documents']

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
  const [avatarBg, setAvatarBg] = useState(agent?.avatarBg ?? PALETTE[0])
  const [capabilities, setCapabilities] = useState<AgentCapability[]>(agent?.capabilities ?? DEFAULT_CAPABILITIES)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(agent?.avatarUrl ?? null)
  const [generatingAvatar, setGeneratingAvatar] = useState(false)
  const [avatarErr, setAvatarErr] = useState<string | null>(null)
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
        name, role, systemPrompt, bio, avatarBg, capabilities,
      }
      if (editing) {
        // Only send avatarUrl on change so we don't clobber it on no-op edits.
        if ((agent!.avatarUrl ?? null) !== avatarUrl) payload.avatarUrl = avatarUrl
        await api.updateAgent(agent!.id, payload)
      } else {
        // No `id` field on create — server slugifies it from `name`
        // and guarantees global uniqueness.
        await api.createAgent(payload)
      }
      await useParticipants.getState().load()
      await useConversations.getState().reload()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const initial = (name || agent?.id || '?').charAt(0).toUpperCase()

  const generateAvatar = async () => {
    if (!editing || !agent) return
    setAvatarErr(null)
    setGeneratingAvatar(true)
    try {
      // First save any pending edits so the prompt reflects what the user typed.
      await api.updateAgent(agent.id, { name, role, systemPrompt, bio, avatarBg })
      const r = await api.generateAgentAvatar(agent.id)
      setAvatarUrl(r.url)
      await useParticipants.getState().load()
    } catch (e) {
      setAvatarErr(e instanceof Error ? e.message : String(e))
    } finally {
      setGeneratingAvatar(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: 'rgba(15, 30, 50, 0.55)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="bg-cloud rounded-[18px] shadow-pop w-full max-w-[560px] max-h-[90vh] flex flex-col overflow-hidden"
        style={{ border: '1px solid var(--ink-100)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-ink-100 flex items-center gap-3 shrink-0">
          <div
            className="w-12 h-12 rounded-full grid place-items-center text-white font-bold text-[18px] shrink-0 overflow-hidden relative"
            style={{ background: avatarUrl ? 'transparent' : avatarBg }}
          >
            {avatarUrl
              ? <img src={avatarUrl} alt={name || initial} className="absolute inset-0 w-full h-full object-cover" />
              : initial}
          </div>
          <div className="flex-1">
            <h2 className="font-display font-medium text-[20px] tracking-tight">
              {editing ? `Edit ${agent!.name}` : "新智能体"}
            </h2>
            <div className="text-[12.5px] text-ink-500 italic font-display">
              {editing ? "调整该队友的行为方式。" : "从头开始​​定义一个新队友。"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full grid place-items-center text-ink-500 hover:bg-sky2-50 hover:text-ink-900 transition"
            aria-label="关闭"
          >×</button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          <Field label="姓名" hint="队友怎么称呼他们。句柄（@-mention id）是自动从中派生的。">
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如佐贺"
            />
          </Field>

          <Field label="角色" hint="名称旁边显示一个或两个单词的标题。">
            <Input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="例如讲故事的人"
            />
          </Field>

          <Field label="风格（系统提示符）" hint="特工的声音、本能和怪癖。以第二人称书写 — LLM 将其读作“你”。">
            <TextArea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              placeholder="你写叙述。你感觉到团队忘记大声说出来的话。直接、热情、从不说教。"
              className="font-display italic"
              style={{ minHeight: 110 }}
            />
          </Field>

          <Field label="简历" hint="可选，显示在智能体卡上。">
            <TextArea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              placeholder="对他们最擅长的事情的一行描述。"
            />
          </Field>

          <Field label="运行时" hint="所有学习 Agent 使用同一套 LingxiLoop Agent OS 与全局模型配置。">
            <div className="rounded-[10px] bg-sky2-50 px-3 py-2 text-[12.5px] text-ink-700">
              LingxiLoop Agent OS · Persistent IPython
            </div>
          </Field>

          <Field label="能力与权限" hint="只允许该智能体使用已勾选的能力；可随时撤销。高风险动作仍会单独请求批准。">
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
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setCapabilities((current) => checked
                        ? current.filter((capability) => capability !== option.id)
                        : [...current, option.id])}
                      className="mt-0.5 accent-[var(--skype)]"
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

          <Field label="头像颜色" hint="用作未生成 AI 肖像时的后备。">
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAvatarBg(c)}
                  className="w-8 h-8 rounded-full transition"
                  style={{
                    background: c,
                    boxShadow: avatarBg === c
                      ? '0 0 0 3px var(--cloud), 0 0 0 5px var(--skype)'
                      : 'inset 0 0 0 1px rgba(0,0,0,0.06)',
                  }}
                  aria-label={c}
                />
              ))}
            </div>
          </Field>

          <Field
            label="AI生成的肖像"
            hint={editing
              ? "生成适合该特工的姓名、角色和风格的社论肖像。如果您调整了样式，请先保存您的编辑。"
              : "创建智能体后可用。先保存，然后重新打开生成。"}
          >
            <div className="flex items-center gap-4">
              {/* Avatar preview with breathing/sparkle animation while generating */}
              <div className="relative shrink-0" style={{ width: 88, height: 88 }}>
                {/* Soft outer glow that breathes */}
                {generatingAvatar && (
                  <div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      inset: -8,
                      background: 'conic-gradient(from 0deg, #FFB088, #7C5CFF, #4FC2F4, #6EC56A, #FFB088)',
                      filter: 'blur(8px)',
                      opacity: 0.55,
                      animation: 'ae-spin 3s linear infinite, ae-breathe 1.6s ease-in-out infinite',
                    }}
                  />
                )}
                {/* Avatar bubble */}
                <div
                  className="absolute inset-0 rounded-full grid place-items-center text-white font-bold text-[28px]"
                  style={{
                    background: avatarUrl ? 'transparent' : avatarBg,
                    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)',
                    transform: generatingAvatar ? undefined : 'scale(1)',
                    animation: generatingAvatar ? 'ae-pop 1.6s cubic-bezier(.36,1.6,.4,1) infinite' : undefined,
                  }}
                >
                  {avatarUrl
                    ? <img src={avatarUrl} alt={name || initial} className="absolute inset-0 w-full h-full object-cover rounded-full" />
                    : initial}
                  {/* Diagonal shimmer sweep */}
                  {generatingAvatar && (
                    <div
                      className="absolute inset-0 rounded-full pointer-events-none overflow-hidden"
                    >
                      <div
                        className="absolute"
                        style={{
                          inset: '-50%',
                          background: 'linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%)',
                          animation: 'ae-sheen 2.2s cubic-bezier(.4,0,.2,1) infinite',
                        }}
                      />
                    </div>
                  )}
                </div>
                {/* Twinkling sparkles ✦ */}
                {generatingAvatar && (
                  <>
                    <span className="absolute text-whisper select-none pointer-events-none"
                      style={{ top: -2, right: 6, fontSize: 14, animation: 'ae-twinkle 1.4s ease-in-out infinite', animationDelay: '0s' }}>✦</span>
                    <span className="absolute text-skype-deep select-none pointer-events-none"
                      style={{ bottom: 4, left: -4, fontSize: 11, animation: 'ae-twinkle 1.4s ease-in-out infinite', animationDelay: '0.45s' }}>✦</span>
                    <span className="absolute text-gold select-none pointer-events-none"
                      style={{ top: '40%', left: -6, fontSize: 9, animation: 'ae-twinkle 1.4s ease-in-out infinite', animationDelay: '0.9s' }}>✦</span>
                  </>
                )}
              </div>

              <div className="flex-1 flex flex-col gap-2 min-w-0">
                <button
                  type="button"
                  onClick={generateAvatar}
                  disabled={!editing || generatingAvatar}
                  className="self-start inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[12.5px] font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    // Hardcoded purple — this button intentionally keeps the
                    // old AI-portrait accent, decoupled from the whisper
                    // palette which has since moved to sage. Don't switch
                    // back to var(--whisper) here.
                    background: editing
                      ? 'linear-gradient(135deg, #7C5CFF, #4A2D9E)'
                      : 'var(--ink-100)',
                    color: editing ? 'white' : 'var(--ink-500)',
                    boxShadow: editing && !generatingAvatar ? '0 4px 12px -3px rgba(124, 92, 255, 0.45)' : 'none',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={generatingAvatar ? { animation: 'ae-icon-twinkle 1.2s ease-in-out infinite', transformOrigin: 'center' } : undefined}>
                    <path d="M12 2l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M19 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>
                  </svg>
                  {generatingAvatar
                    ? <span>绘画<span className="ae-dots" /></span>
                    : (avatarUrl ? "再生" : "用 AI 生成")}
                </button>

                {generatingAvatar && (
                  <div className="text-[11.5px] text-whisper-deep font-display italic leading-[1.5]">
                    作曲 {name || 'your agent'}的肖像 — 通常为 15-30 秒。您可以继续编辑其他字段。
                  </div>
                )}

                {avatarUrl && !generatingAvatar && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl(null)}
                    className="self-start text-[11.5px] text-ink-500 hover:text-coral-deep transition"
                  >清晰肖像（使用色块代替）</button>
                )}

                {avatarErr && (
                  <div className="text-[11.5px] text-coral-deep bg-coral-soft py-1.5 px-2 rounded-md leading-[1.4]">
                    {avatarErr}
                  </div>
                )}
              </div>
            </div>
          </Field>

          {err && (
            <div className="text-[12.5px] text-coral-deep bg-coral-soft py-2 px-3 rounded-lg">
              {err}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-ink-100 flex items-center gap-2 bg-paper shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-[9px] text-[12.5px] font-semibold text-ink-700 bg-cloud hover:bg-sky2-50 transition"
            style={{ border: '1px solid var(--ink-100)' }}
          >取消</button>
          <div className="flex-1" />
          <button
            onClick={submit}
            disabled={busy || !name.trim() || !systemPrompt.trim()}
            className="px-5 py-2 rounded-[9px] text-[12.5px] font-semibold text-white transition disabled:opacity-50"
            style={{
              background: 'var(--skype)',
              boxShadow: '0 4px 12px -3px rgba(0, 168, 240, 0.5)',
            }}
          >
            {busy ? "正在保存..." : (editing ? "保存更改" : "创建智能体")}
          </button>
        </div>
      </div>

      <style>{`
        /* === avatar generation animations === */
        @keyframes ae-spin   { to { transform: rotate(360deg); } }
        @keyframes ae-breathe {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50%      { opacity: 0.75; transform: scale(1.08); }
        }
        @keyframes ae-pop {
          0%, 100% { transform: scale(1); }
          40%      { transform: scale(1.04); }
          70%      { transform: scale(0.985); }
        }
        @keyframes ae-sheen {
          0%   { transform: translateX(-60%) translateY(-60%) rotate(0deg); }
          100% { transform: translateX(60%)  translateY(60%)  rotate(0deg); }
        }
        @keyframes ae-twinkle {
          0%, 100% { opacity: 0.2; transform: scale(0.7); }
          50%      { opacity: 1;   transform: scale(1.15); }
        }
        @keyframes ae-icon-twinkle {
          0%, 100% { opacity: 0.7; transform: scale(0.92); }
          50%      { opacity: 1;   transform: scale(1.08); }
        }
        @keyframes ae-dot {
          0%, 20%  { opacity: 0; }
          50%      { opacity: 1; }
          80%, 100%{ opacity: 0; }
        }
        .ae-dots::after {
          content: '...';
          letter-spacing: 2px;
          display: inline-block;
          margin-left: 2px;
          animation: ae-dot 1.4s steps(4, end) infinite;
        }
      `}</style>
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
