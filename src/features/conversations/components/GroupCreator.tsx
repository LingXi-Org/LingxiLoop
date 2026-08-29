/**
 * Modal for creating a new group conversation. User picks a title and a set of
 * teammates (active agents + other humans). Yetone is auto-included.
 */
import { useMemo, useRef, useState } from 'react'
import { conversationsApi } from '../api'
import { useMe } from '@/stores/auth'
import { useParticipants } from '@/features/agents/state'
import { useConversations } from '../store'
import { useApp } from '@/stores/app'
import { useWorkspace } from '@/features/knowledge/workspace'
import { Avatar } from '@/components/Avatar'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
  const workspaceId = useWorkspace((s) => s.selectedId)

  const candidates = useMemo<Participant[]>(() => {
    return Object.values(byId)
      .filter((p) => p.id !== meId && !p.departedAt && !p.managed)
      .sort((a, b) => {
        // Agents first, then humans, then alphabetical.
        if (a.kind !== b.kind) return a.kind === 'agent' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }, [byId, meId])

  const [title, setTitle] = useState('')
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initialPicked ?? []))
  const [leaderId, setLeaderId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const requestIdRef = useRef<string | null>(null)

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
    if (names.length === 2) return `${names[0]}、${names[1]}`
    if (names.length === 3) return `${names[0]}、${names[1]}、${names[2]}`
    return `${names[0]}、${names[1]}等 ${names.length} 位成员`
  }, [candidates, picked])

  const submit = async () => {
    setErr(null)
    if (picked.size === 0) { setErr('请至少选择一名成员'); return }
    if (!leaderId) { setErr('请选择一名智能体作为负责人'); return }
    if (!workspaceId) { setErr('请先选择工作区'); return }
    const finalTitle = title.trim() || autoTitle
    if (!finalTitle) { setErr('请填写标题或选择成员'); return }
    setBusy(true)
    try {
      requestIdRef.current ??= crypto.randomUUID()
      const r = await conversationsApi.createGroup({
        clientRequestId: requestIdRef.current,
        title: finalTitle,
        members: [...picked],
        leaderId,
        workspaceId,
      })
      requestIdRef.current = null
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
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent className="flex max-h-[88vh] max-w-[520px] flex-col gap-0 overflow-hidden bg-cloud p-0" showCloseButton={!busy}>
        <DialogHeader className="shrink-0 border-b border-ink-100 px-6 py-5 pr-14">
          <DialogTitle className="font-display text-[20px] font-medium tracking-tight">新建群聊</DialogTitle>
          <DialogDescription className="mt-0.5 font-display text-[12.5px] italic text-ink-500">
            邀请成员加入共享对话；你会自动成为群成员。
          </DialogDescription>
        </DialogHeader>

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
            placeholder={autoTitle || '例如：Aurora 发布准备 · 第 1 周'}
            autoFocus
            className="mb-5"
            maxLength={80}
          />

          <label className="block text-[11px] font-bold tracking-wider uppercase text-ink-500 mb-1">成员</label>
          <div className="text-[11.5px] text-ink-300 mb-2 font-display italic">
            {picked.size === 0 ? "点击添加" : `已选择 ${picked.size} 位 · 你会自动加入`}
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
                      {p.role || (p.kind === 'human' ? '成员' : '智能体')}
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
                暂无可选成员，请先添加智能体或公司成员。
              </div>
            )}
          </div>

          <label className="block text-[11px] font-bold tracking-wider text-ink-500 mt-5 mb-1">负责人</label>
          <div className="text-[11.5px] text-ink-300 mb-2 font-display italic">
            负责人响应普通群聊消息，并可通过 @提及 分派其他成员。
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
                  <span className="text-[10px] font-bold tracking-wider text-skype-deep">{on ? '负责人' : '设为负责人'}</span>
                </button>
              )
            })}
            {leaderCandidates.length === 0 && (
              <div className="rounded-[10px] border border-dashed border-ink-200 px-3 py-3 text-[12px] text-ink-400">
                请先在上方选择至少一名可用智能体，再在此指定负责人。
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
          >{busy ? "正在创建…" : `创建群聊${picked.size > 0 ? `（${picked.size + 1} 人）` : ''}`}</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
