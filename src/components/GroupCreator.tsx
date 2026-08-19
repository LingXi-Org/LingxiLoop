/**
 * Modal for creating a new group conversation. User picks a title and a set of
 * teammates (active agents + other humans). Yetone is auto-included.
 */
import { useEffect, useMemo, useState } from 'react'
import { api, type ApiProject } from '@/api/client'
import { useMe } from '@/stores/auth'
import { useParticipants } from '@/stores/participants'
import { useConversations } from '@/stores/conversations'
import { useApp } from '@/stores/app'
import { Avatar } from '@/components/Avatar'
import { Input } from '@/components/Input'
import type { Participant } from '@/types'

interface Props {
  onClose: () => void
  /** participant ids to pre-select (e.g. when entering from a direct-chat right-click) */
  initialPicked?: string[]
}

export function GroupCreator({ onClose, initialPicked }: Props) {
  const byId = useParticipants((s) => s.byId)
  const select = useApp((s) => s.selectConversation)
  const setView = useApp((s) => s.setView)
  const meId = useMe()

  const candidates = useMemo<Participant[]>(() => {
    return Object.values(byId)
      .filter((p) => p.id !== meId && !p.departedAt)
      .sort((a, b) => {
        // Agents first, then humans, then alphabetical.
        if (a.kind !== b.kind) return a.kind === 'agent' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }, [byId, meId])

  const [title, setTitle] = useState('')
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initialPicked ?? []))
  const [leaderId, setLeaderId] = useState<string | null>(null)
  const [projects, setProjects] = useState<ApiProject[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    void api.listProjects()
      .then((list) => setProjects(list.filter((p) => p.status === 'active')))
      .catch(() => { /* ignore — picker just hides */ })
  }, [])

  const toggle = (id: string) => {
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(id)) {
        next.delete(id)
        if (leaderId === id) setLeaderId(null)
      }
      else next.add(id)
      return next
    })
  }

  // Live auto-title from selected members. "Iris, Bram & Nova" up to 3 names,
  // then "Iris, Bram & 2 more". Used as placeholder + as the value when the
  // user leaves the title blank.
  const autoTitle = useMemo(() => {
    const names = candidates.filter((p) => picked.has(p.id)).map((p) => p.name)
    if (names.length === 0) return ''
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]} & ${names[1]}`
    if (names.length === 3) return `${names[0]}, ${names[1]} & ${names[2]}`
    return `${names[0]}, ${names[1]} & ${names.length - 2} more`
  }, [candidates, picked])

  const submit = async () => {
    setErr(null)
    if (picked.size === 0) { setErr('pick at least one teammate'); return }
    if (!leaderId) { setErr('choose an agent as Leader'); return }
    const finalTitle = title.trim() || autoTitle
    if (!finalTitle) { setErr('add a title or pick a teammate'); return }
    setBusy(true)
    try {
      const r = await api.createGroup({ title: finalTitle, members: [...picked], leaderId, projectId })
      await useConversations.getState().reload()
      setView('conversations')
      select(r.id)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const leaderCandidates = candidates.filter((p) => p.kind === 'agent' && picked.has(p.id))
  const canSubmit = picked.size > 0 && Boolean(leaderId) && !busy

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: 'rgba(15, 30, 50, 0.55)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="bg-cloud rounded-[18px] shadow-pop w-full max-w-[520px] max-h-[88vh] flex flex-col overflow-hidden"
        style={{ border: '1px solid var(--ink-100)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-ink-100 shrink-0">
          <h2 className="font-display font-medium text-[20px] tracking-tight">新组</h2>
          <div className="text-[12.5px] text-ink-500 italic font-display mt-0.5">
            将一些队友拉入共享对话。你将永远在其中。
          </div>

        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0">
          <label className="block text-[11px] font-bold tracking-wider uppercase text-ink-500 mb-1">
            标题
            <span className="ml-1.5 text-ink-300 normal-case font-medium tracking-normal">— 可选</span>
          </label>
          <div className="text-[11.5px] text-ink-300 mb-1.5 font-display italic">
            {autoTitle
              ? <>留空以使用 <b className="not-italic text-ink-500">"{autoTitle}"</b>.</>
              : <>这个小组是关于什么的？留空，我们将从您选择的成员中命名。</>}
          </div>
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={autoTitle || 'e.g. Aurora launch — week 1'}
            autoFocus
            className="mb-5"
            maxLength={80}
          />

          {projects.length > 0 && (
            <>
              <label className="block text-[11px] font-bold tracking-wider uppercase text-ink-500 mb-1">
                项目
                <span className="ml-1.5 text-ink-300 normal-case font-medium tracking-normal">— 可选</span>
              </label>
              <div className="text-[11.5px] text-ink-300 mb-1.5 font-display italic">
                将此组附加到项目，以便智能体查看其所属内容。
              </div>
              <div className="flex flex-wrap gap-1.5 mb-5">
                <button
                  type="button"
                  onClick={() => setProjectId(null)}
                  className="px-2.5 py-1 rounded-full text-[11.5px] font-medium transition"
                  style={{
                    background: projectId === null ? 'var(--ink-700)' : 'var(--paper)',
                    color: projectId === null ? 'white' : 'var(--ink-500)',
                    border: '1px solid var(--ink-100)',
                  }}
                >没有项目</button>
                {projects.map((p) => {
                  const on = projectId === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProjectId(p.id)}
                      className="px-2.5 py-1 rounded-full text-[11.5px] font-medium transition"
                      style={{
                        background: on ? (p.color ?? 'var(--skype)') : 'var(--paper)',
                        color: on ? 'white' : 'var(--ink-700)',
                        border: '1px solid var(--ink-100)',
                      }}
                    >{p.name}</button>
                  )
                })}
              </div>
            </>
          )}

          <label className="block text-[11px] font-bold tracking-wider uppercase text-ink-500 mb-1">成员</label>
          <div className="text-[11.5px] text-ink-300 mb-2 font-display italic">
            {picked.size === 0 ? "点击添加" : `${picked.size} selected — you are auto-included`}
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {candidates.map((p) => {
              const on = picked.has(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="text-left flex items-center gap-3 py-2 px-2.5 rounded-[10px] transition"
                  style={{
                    background: on ? 'var(--sky-50)' : 'var(--paper)',
                    border: `1.5px solid ${on ? 'var(--sky2-300)' : 'var(--ink-100)'}`,
                  }}
                >
                  <Avatar p={p} size={32} ringColor="var(--paper)" showStatus={false} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-ink-900 truncate">{p.name}</div>
                    <div className="text-[11px] text-ink-500 truncate">
                      {p.role || (p.kind === 'human' ? 'human' : 'agent')}
                    </div>
                  </div>
                  <span
                    className="w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold transition"
                    style={{
                      background: on ? 'var(--skype)' : 'transparent',
                      color: on ? 'white' : 'var(--ink-300)',
                      border: on ? '1.5px solid var(--skype)' : '1.5px solid var(--ink-200)',
                    }}
                  >{on ? '✓' : ''}</span>
                </button>
              )
            })}
            {candidates.length === 0 && (
              <div className="text-[12.5px] text-ink-500 italic font-display py-4 text-center">
                没有可用的队友 - 首先添加智能体或人员。
              </div>
            )}
          </div>

          <label className="block text-[11px] font-bold tracking-wider uppercase text-ink-500 mt-5 mb-1">Leader</label>
          <div className="text-[11.5px] text-ink-300 mb-2 font-display italic">
            Explicitly choose the agent that handles ordinary group messages and delegates with @mentions.
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {leaderCandidates.map((p) => {
              const on = leaderId === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setLeaderId(p.id)}
                  className="text-left flex items-center gap-3 py-2 px-2.5 rounded-[10px] transition"
                  style={{
                    background: on ? 'var(--sky-50)' : 'var(--paper)',
                    border: `1.5px solid ${on ? 'var(--skype)' : 'var(--ink-100)'}`,
                  }}
                >
                  <Avatar p={p} size={30} ringColor="var(--paper)" showStatus={false} />
                  <span className="flex-1 text-[13px] font-semibold text-ink-900">{p.name}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-skype-deep">{on ? 'Leader' : 'Set leader'}</span>
                </button>
              )
            })}
            {leaderCandidates.length === 0 && (
              <div className="rounded-[10px] border border-dashed border-ink-200 px-3 py-3 text-[12px] text-ink-400">
                Select at least one active agent above, then choose the Leader here.
              </div>
            )}
          </div>

          {err && (
            <div className="text-[12.5px] text-coral-deep bg-coral-soft py-2 px-3 rounded-lg mt-4">
              {err}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-ink-100 flex items-center gap-2 bg-paper shrink-0">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-[9px] text-[12.5px] font-semibold text-ink-700 bg-cloud hover:bg-sky2-50 transition"
            style={{ border: '1px solid var(--ink-100)' }}
          >取消</button>
          <div className="flex-1" />
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-5 py-2 rounded-[9px] text-[12.5px] font-semibold text-white transition disabled:opacity-50"
            style={{
              background: 'var(--skype)',
              boxShadow: '0 4px 12px -3px rgba(0, 168, 240, 0.5)',
            }}
          >{busy ? "正在创建..." : `Create group${picked.size > 0 ? ` (${picked.size + 1})` : ''}`}</button>
        </div>
      </div>
    </div>
  )
}
