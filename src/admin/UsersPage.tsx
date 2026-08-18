/**
 * Users — paginated, searchable, with inline detail expand + tier /
 * admin toggles per row.
 */
import { useCallback, useEffect, useState } from 'react'
import { adminApi, type AdminUser, type AdminUserDetail, type AdminStats, type Tier } from './api'
import { Pager } from './Pager'
import { useAuth } from '@/stores/auth'

const PAGE = 50

export function UsersPage({ stats }: { stats: AdminStats | null }) {
  const meId = useAuth((s) => s.user?.id ?? null)
  const [q, setQ] = useState('')
  const [tier, setTier] = useState<Tier | ''>('')
  const [items, setItems] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async (nextOffset: number) => {
    setLoading(true); setErr(null)
    try {
      const r = await adminApi.listUsers({ q, tier, limit: PAGE, offset: nextOffset })
      setItems(r.items); setTotal(r.total); setOffset(r.offset)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }, [q, tier])

  // Reload on search/filter change with a light debounce so each keystroke
  // doesn't spam the API.
  useEffect(() => {
    const t = setTimeout(() => { void load(0) }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [q, tier, load])

  const onTierChange = async (u: AdminUser, next: Tier) => {
    if (u.tier === next) return
    try {
      const updated = await adminApi.patchUser(u.id, { tier: next })
      setItems((rows) => rows.map((r) => (r.id === u.id ? updated : r)))
    } catch (e) { alert(`tier update failed: ${e instanceof Error ? e.message : e}`) }
  }

  const onAdminToggle = async (u: AdminUser) => {
    if (u.id === meId && u.isAdmin) {
      alert("You can't remove your own admin bit.")
      return
    }
    try {
      const updated = await adminApi.patchUser(u.id, { isAdmin: !u.isAdmin })
      setItems((rows) => rows.map((r) => (r.id === u.id ? updated : r)))
    } catch (e) { alert(`admin toggle failed: ${e instanceof Error ? e.message : e}`) }
  }

  /** Suspend / unsuspend. The server enforces "can't suspend self" too —
   *  this client-side guard just spares the operator the round-trip + alert. */
  const onSuspendToggle = async (u: AdminUser): Promise<AdminUser | null> => {
    if (u.id === meId && !u.suspended) {
      alert("You can't suspend yourself.")
      return null
    }
    try {
      if (u.suspended) {
        const updated = await adminApi.unsuspendUser(u.id)
        setItems((rows) => rows.map((r) => (r.id === u.id ? updated : r)))
        return updated
      }
      // Prompt for a reason — surfaced to the user verbatim on the
      // suspended screen so it helps to be specific. Cancelling the
      // prompt aborts the action entirely. Empty string OK (means
      // "no reason given").
      const reason = window.prompt(
        `Suspend ${u.name} (${u.email})?\n\nOptional reason — shown to the user on the lockout screen:`,
        '',
      )
      if (reason === null) return null
      const trimmed = reason.trim()
      const updated = await adminApi.suspendUser(u.id, trimmed || null)
      setItems((rows) => rows.map((r) => (r.id === u.id ? updated : r)))
      return updated
    } catch (e) {
      alert(`suspension toggle failed: ${e instanceof Error ? e.message : e}`)
      return null
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1 className="admin-h1">Users</h1>
          <div className="admin-sub">
            {stats
              ? <>{stats.users.total} total · {stats.users.admins} admin · {stats.users.tiers.free} free · {stats.users.tiers.pro} pro · {stats.users.tiers.max} max</>
              : <>&nbsp;</>}
          </div>
        </div>
        <div className="admin-filters">
          <input
            type="search" placeholder="email or name" className="admin-input"
            value={q} onChange={(e) => setQ(e.target.value)}
          />
          <select className="admin-select" value={tier} onChange={(e) => setTier(e.target.value as Tier | '')}>
            <option value="">All tiers</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="max">Max</option>
          </select>
        </div>
      </header>

      {err && <div className="admin-banner-err">{err}</div>}

      <div className="admin-table">
        <div className="admin-thead">
          <div>User</div>
          <div>Tier</div>
          <div>Admin</div>
          <div>Companies</div>
          <div>Joined</div>
          <div>Last login</div>
        </div>
        {loading && items.length === 0 && <div className="admin-row admin-empty">Loading…</div>}
        {!loading && items.length === 0 && <div className="admin-row admin-empty">No users match.</div>}
        {items.map((u) => (
          <UserRow
            key={u.id} u={u} expanded={expandedId === u.id}
            onToggleExpand={() => setExpandedId((cur) => (cur === u.id ? null : u.id))}
            onTierChange={(t) => onTierChange(u, t)}
            onAdminToggle={() => onAdminToggle(u)}
            onSuspendToggle={() => onSuspendToggle(u)}
            isMe={u.id === meId}
          />
        ))}
      </div>

      <Pager total={total} pageSize={PAGE} offset={offset} loading={loading} onPage={(o) => void load(o)} />
    </div>
  )
}

function UserRow({ u, expanded, onToggleExpand, onTierChange, onAdminToggle, onSuspendToggle, isMe }: {
  u: AdminUser
  expanded: boolean
  onToggleExpand: () => void
  onTierChange: (t: Tier) => void
  onAdminToggle: () => void
  onSuspendToggle: () => Promise<AdminUser | null>
  isMe: boolean
}) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    if (!expanded || detail) return
    setLoadingDetail(true)
    adminApi.getUser(u.id)
      .then(setDetail)
      .catch((e) => alert(`load failed: ${e instanceof Error ? e.message : e}`))
      .finally(() => setLoadingDetail(false))
  }, [expanded, detail, u.id])

  // Detail drawer's suspend action — keep the AdminUserDetail snapshot in
  // sync with the freshly-patched row from the parent, so the reason
  // / actor / timestamp re-render without re-fetching.
  const handleSuspendClick = async () => {
    const updated = await onSuspendToggle()
    if (updated && detail) {
      setDetail({ ...detail, ...updated })
    }
  }

  return (
    <>
      <div className={`admin-row ${u.suspended ? 'admin-row-suspended' : ''}`} onClick={onToggleExpand} role="button">
        <div className="admin-cell-user">
          <img className="admin-avatar" src={u.avatarUrl} alt="" loading="lazy" />
          <div className="admin-cell-user-text">
            <div className="admin-cell-user-name">
              {u.name}
              {isMe && <span className="admin-pill admin-pill-soft" style={{ marginLeft: 8 }}>you</span>}
              {u.suspended && <span className="admin-pill admin-pill-warn" style={{ marginLeft: 8 }}>suspended</span>}
            </div>
            <div className="admin-cell-user-email">{u.email}</div>
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()} data-label="Tier">
          <select className="admin-select admin-select-sm"
            value={u.tier} onChange={(e) => onTierChange(e.target.value as Tier)}>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="max">Max</option>
          </select>
        </div>
        <div onClick={(e) => e.stopPropagation()} data-label="Admin">
          <button
            className={`admin-toggle ${u.isAdmin ? 'is-on' : ''}`}
            onClick={onAdminToggle}
            disabled={isMe && u.isAdmin}
            title={isMe && u.isAdmin ? "Can't remove your own admin" : ''}
          >
            {u.isAdmin ? 'admin' : '—'}
          </button>
        </div>
        <div data-label="Companies">{u.companyCount}</div>
        <div className="admin-cell-mono" data-label="Joined">{fmtDate(u.createdAt)}</div>
        <div className="admin-cell-mono" data-label="Last login">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : '—'}</div>
      </div>
      {expanded && (
        <div className="admin-row-detail">
          {loadingDetail && <div className="admin-empty">Loading details…</div>}
          {detail && (
            <div className="admin-detail-grid">
              <DetailField label="User ID" value={detail.id} mono />
              <DetailField label="sub2api ID" value={detail.sub2apiUserId ? String(detail.sub2apiUserId) : '—'} mono />
              <DetailField label="Created"   value={fmtDateTime(detail.createdAt)} mono />
              <DetailField label="Last login" value={detail.lastLoginAt ? fmtDateTime(detail.lastLoginAt) : '—'} mono />
              {/* Suspension card — only shown when the row IS suspended. We
                  surface the reason, who suspended them, and when, so the
                  operator has all the context before deciding to unsuspend. */}
              {detail.suspended && (
                <div className="admin-detail-suspended">
                  <div className="admin-detail-label">Suspended</div>
                  <div className="admin-detail-suspended-meta">
                    {detail.suspendedAt ? fmtDateTime(detail.suspendedAt) : '—'}
                    {detail.suspendedBy ? <> · by <span className="admin-cell-mono">{detail.suspendedBy}</span></> : null}
                  </div>
                  {detail.suspensionReason && (
                    <div className="admin-detail-suspended-reason">{detail.suspensionReason}</div>
                  )}
                </div>
              )}
              <div className="admin-detail-actions">
                <button
                  className={`btn-ghost ${detail.suspended ? '' : 'admin-btn-danger'}`}
                  onClick={handleSuspendClick}
                  disabled={isMe && !detail.suspended}
                  title={isMe && !detail.suspended ? "You can't suspend yourself" : ''}
                >
                  {detail.suspended ? 'Unsuspend' : 'Suspend account'}
                </button>
              </div>
              <div className="admin-detail-companies">
                <div className="admin-detail-label">Companies ({detail.companies.length})</div>
                {detail.companies.length === 0 && <div className="admin-empty">No companies.</div>}
                {detail.companies.map((c) => (
                  <div key={c.id} className="admin-detail-company">
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div className="admin-cell-user-email">{c.slug} · {c.role}</div>
                    </div>
                    <div className="admin-cell-mono">{c.agentCount} agents</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="admin-detail-field">
      <div className="admin-detail-label">{label}</div>
      <div className={mono ? 'admin-cell-mono' : ''}>{value}</div>
    </div>
  )
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' })
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { year: '2-digit', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
