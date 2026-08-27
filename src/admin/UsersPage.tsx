/**
 * Users — paginated, searchable, with inline detail expand + tier /
 * admin toggles per row.
 */
import { useCallback, useEffect, useState } from 'react'
import { SelectField } from '@/components/ui/select-field'
import { useAuth } from '@/stores/auth'
import { type AdminStats, type AdminUser, type AdminUserDetail, adminApi, type Tier } from './api'
import { Pager } from './Pager'

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
          <h1 className="admin-h1">用户</h1>
          <div className="admin-sub">
            {stats
              ? <>{stats.users.total} 总计· {stats.users.admins} 管理· {stats.users.tiers.free} 免费· {stats.users.tiers.pro} 亲· {stats.users.tiers.max} 最大</>
              : <>&nbsp;</>}
          </div>
        </div>
        <div className="admin-filters">
          <input
            type="search" placeholder="电子邮件或姓名" className="admin-input"
            value={q} onChange={(e) => setQ(e.target.value)}
          />
          <SelectField
            ariaLabel="筛选用户级别"
            value={tier}
            onValueChange={(value) => setTier(value as Tier | '')}
            options={[
              { value: '', label: '所有级别' },
              { value: 'free', label: '免费' },
              { value: 'pro', label: '专业版' },
              { value: 'max', label: '最大' },
            ]}
            className="w-36"
          />
        </div>
      </header>

      {err && <div className="admin-banner-err">{err}</div>}

      <div className="admin-table">
        <div className="admin-thead">
          <div>用户</div>
          <div>等级</div>
          <div>管理员</div>
          <div>公司</div>
          <div>已加入</div>
          <div>上次登录</div>
        </div>
        {loading && items.length === 0 && <div className="admin-row admin-empty">加载中…</div>}
        {!loading && items.length === 0 && <div className="admin-row admin-empty">没有用户匹配。</div>}
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
              {isMe && <span className="admin-pill admin-pill-soft" style={{ marginLeft: 8 }}>你</span>}
              {u.suspended && <span className="admin-pill admin-pill-warn" style={{ marginLeft: 8 }}>暂停</span>}
            </div>
            <div className="admin-cell-user-email">{u.email}</div>
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()} data-label="Tier">
          <SelectField
            ariaLabel={`更改 ${u.name || u.email} 的级别`}
            value={u.tier}
            onValueChange={(value) => onTierChange(value as Tier)}
            options={[
              { value: 'free', label: '免费' },
              { value: 'pro', label: '专业版' },
              { value: 'max', label: '最大' },
            ]}
            size="compact"
            className="w-24"
          />
        </div>
        <div onClick={(e) => e.stopPropagation()} data-label="Admin">
          <button
            className={`admin-toggle ${u.isAdmin ? 'is-on' : ''}`}
            onClick={onAdminToggle}
            disabled={isMe && u.isAdmin}
            title={isMe && u.isAdmin ? "无法删除您自己的管理员" : ''}
          >
            {u.isAdmin ? "管理员" : '—'}
          </button>
        </div>
        <div data-label="Companies">{u.companyCount}</div>
        <div className="admin-cell-mono" data-label="Joined">{fmtDate(u.createdAt)}</div>
        <div className="admin-cell-mono" data-label="Last login">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : '—'}</div>
      </div>
      {expanded && (
        <div className="admin-row-detail">
          {loadingDetail && <div className="admin-empty">正在加载详细信息...</div>}
          {detail && (
            <div className="admin-detail-grid">
              <DetailField label="用户 ID" value={detail.id} mono />
              <DetailField label="sub2api ID" value={detail.sub2apiUserId ? String(detail.sub2apiUserId) : '—'} mono />
              <DetailField label="已创建"   value={fmtDateTime(detail.createdAt)} mono />
              <DetailField label="上次登录" value={detail.lastLoginAt ? fmtDateTime(detail.lastLoginAt) : '—'} mono />
              {/* Suspension card — only shown when the row IS suspended. We
                  surface the reason, who suspended them, and when, so the
                  operator has all the context before deciding to unsuspend. */}
              {detail.suspended && (
                <div className="admin-detail-suspended">
                  <div className="admin-detail-label">暂停</div>
                  <div className="admin-detail-suspended-meta">
                    {detail.suspendedAt ? fmtDateTime(detail.suspendedAt) : '—'}
                    {detail.suspendedBy ? <> ·由 <span className="admin-cell-mono">{detail.suspendedBy}</span></> : null}
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
                  title={isMe && !detail.suspended ? "你不能暂停自己" : ''}
                >
                  {detail.suspended ? "取消暂停" : "暂停帐户"}
                </button>
              </div>
              <div className="admin-detail-companies">
                <div className="admin-detail-label">公司（{detail.companies.length})</div>
                {detail.companies.length === 0 && <div className="admin-empty">没有公司。</div>}
                {detail.companies.map((c) => (
                  <div key={c.id} className="admin-detail-company">
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div className="admin-cell-user-email">{c.slug} · {c.role}</div>
                    </div>
                    <div className="admin-cell-mono">{c.agentCount} 智能体</div>
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
