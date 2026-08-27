/**
 * CompanySwitcher — small dropdown in the title bar that shows the active
 * tenant and lets the user hop between companies they're a member of, plus
 * spin up a new one. Lives in TitleBar.tsx.
 *
 * The active company id is stored in the auth store and read by the API
 * client into the `x-company-id` header on every request, so switching here
 * routes all subsequent traffic to the new tenant.
 */
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { companiesApi } from '@/api/companies'
import { Input } from '@/components/ui/input'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { InvitePeopleModal } from './InvitePeopleModal'

export function CompanySwitcher({ zh = false }: { zh?: boolean }) {
  const companies = useAuth((s) => s.companies)
  const activeId = useAuth((s) => s.activeCompanyId)
  const setActive = useAuth((s) => s.setActiveCompany)
  const addCompany = useAuth((s) => s.addCompany)
  const selectConversation = useApp((s) => s.selectConversation)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const popRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false); setCreating(false); setErr(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const active = companies.find((c) => c.id === activeId) ?? companies[0] ?? null

  const switchCompany = (id: string) => {
    if (id !== activeId) {
      selectConversation(null)
      setActive(id)
    }
    setOpen(false)
  }

  const submitNew = async () => {
    const name = newName.trim()
    if (!name) return
    setBusy(true); setErr(null)
    try {
      const created = await companiesApi.createCompany(name)
      selectConversation(null)
      addCompany({ id: created.id, name: created.name, slug: created.slug, role: created.role })
      setNewName(''); setCreating(false); setOpen(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-medium text-ink-700 hover:bg-cloud transition"
        style={{ border: '1px solid var(--ink-100)', background: 'var(--paper)' }}
      >
        <span
          className="w-4 h-4 rounded grid place-items-center text-[10px] font-bold text-white"
          style={{ background: 'var(--skype)' }}
        >
          {active ? active.name.charAt(0).toUpperCase() : '·'}
        </span>
        <span className="max-w-[140px] truncate">{active?.name ?? (zh ? '暂无工作区' : 'no workspace')}</span>
        <span className="text-ink-300 text-[10px] leading-none">▾</span>
      </button>

      {open && (
        <div
          ref={popRef}
          className="app-menu-surface absolute right-0 top-full z-50 mt-1 min-w-[240px] p-1.5"
        >
          <div className="px-3 py-1 text-[10.5px] uppercase tracking-wide text-ink-300 font-display">
            {zh ? '切换工作区' : "切换工作空间"}
          </div>
          {companies.map((c) => (
            <button
              key={c.id}
              onClick={() => switchCompany(c.id)}
              className="app-menu-item"
            >
              <span
                className="w-5 h-5 rounded grid place-items-center text-[10px] font-bold text-white shrink-0"
                style={{ background: 'var(--skype)' }}
              >
                {c.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[12.5px] text-ink-900 truncate">{c.name}</span>
                <span className="block text-[10.5px] text-ink-300 italic font-display">{c.role}</span>
              </span>
              {c.id === activeId && <span className="text-skype-deep text-[12px]">●</span>}
            </button>
          ))}

          <div className="my-1 mx-2 h-px bg-ink-100" />

          {active && (active.role === 'owner' || active.role === 'admin') && (
            <button
              onClick={() => { setInviteOpen(true); setOpen(false) }}
              className="app-menu-item"
            >
              <span
                className="w-5 h-5 rounded grid place-items-center shrink-0 text-[11px]"
                style={{ background: 'var(--sky-50)', color: 'var(--skype)' }}
              >+</span>
              <span className="flex-1">{zh ? '邀请成员加入' : "邀请人们"} <b className="font-semibold">{active.name}</b></span>
            </button>
          )}

          {creating ? (
            <div className="px-3 py-2 space-y-2">
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void submitNew() }}
                placeholder={zh ? '工作区名称' : "工作区名称"}
                className="w-full px-2 py-1.5 text-[12.5px] rounded outline-none"
                style={{ border: '1.5px solid var(--ink-100)', background: 'var(--paper)' }}
              />
              {err && <div className="text-[11px] text-coral-deep">{err}</div>}
              <div className="flex gap-1.5">
                <button
                  onClick={() => void submitNew()}
                  disabled={!newName.trim() || busy}
                  className="flex-1 py-1.5 rounded text-[12px] font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--skype)' }}
                >{busy ? '…' : (zh ? '创建' : "创建")}</button>
                <button
                  onClick={() => { setCreating(false); setNewName(''); setErr(null) }}
                  className="px-3 py-1.5 rounded text-[12px] text-ink-500 hover:bg-cloud"
                >{zh ? '取消' : "取消"}</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="app-menu-item"
            >
              <span className="w-5 h-5 rounded grid place-items-center text-ink-500 shrink-0" style={{ border: '1px dashed var(--ink-100)' }}>+</span>
              {zh ? '创建新工作区' : "创建新工作区"}
            </button>
          )}
        </div>
      )}
      {inviteOpen && active && (
        <InvitePeopleModal
          companyId={active.id}
          companyName={active.name}
          onClose={() => setInviteOpen(false)}
        />
      )}
    </div>
  )
}
