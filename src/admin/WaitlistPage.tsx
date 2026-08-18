/**
 * Waitlist queue. Three sub-tabs: pending / approved / rejected.
 * Approve calls the server which provisions everything (user + company
 * + sub2api) then deletes is row from the queue.
 */
import { useCallback, useEffect, useState } from 'react'
import { adminApi, type AdminWaitlistEntry } from './api'
import { Pager } from './Pager'

type Tab = 'pending' | 'approved' | 'rejected'

const PAGE = 50

export function WaitlistPage({ onChanged }: { onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>('pending')
  const [q, setQ] = useState('')
  const [items, setItems] = useState<AdminWaitlistEntry[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (nextOffset: number) => {
    setLoading(true); setErr(null)
    try {
      const r = await adminApi.listWaitlist({ status: tab, q, limit: PAGE, offset: nextOffset })
      setItems(r.items); setTotal(r.total); setOffset(r.offset)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }, [tab, q])

  useEffect(() => {
    const t = setTimeout(() => { void load(0) }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [q, tab, load])

  const approve = async (entry: AdminWaitlistEntry) => {
    if (busyId) return
    if (!confirm(`Approve ${entry.email}?\nThis creates a real user + workspace + sub2api account.`)) return
    setBusyId(entry.id)
    try {
      await adminApi.approveWaitlist(entry.id)
      await load(offset)
      onChanged()
    } catch (e) {
      alert(`approve failed: ${e instanceof Error ? e.message : e}`)
    } finally { setBusyId(null) }
  }

  const reject = async (entry: AdminWaitlistEntry) => {
    if (busyId) return
    const note = prompt(`Reject ${entry.email}? Optional note:`, '')
    if (note === null) return
    setBusyId(entry.id)
    try {
      await adminApi.rejectWaitlist(entry.id, note.trim() || undefined)
      await load(offset)
      onChanged()
    } catch (e) {
      alert(`reject failed: ${e instanceof Error ? e.message : e}`)
    } finally { setBusyId(null) }
  }

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1 className="admin-h1">Waitlist</h1>
          <div className="admin-sub">
            Decide who gets in. Approve provisions the account end-to-end.
          </div>
        </div>
        <div className="admin-filters">
          <input
            type="search"
            placeholder="email, name, provider, note"
            className="admin-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </header>

      <div className="admin-tabs">
        {(['pending', 'approved', 'rejected'] as Tab[]).map((t) => (
          <button key={t}
            className={`admin-tab${tab === t ? ' is-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {err && <div className="admin-banner-err">{err}</div>}

      <div className="admin-table">
        <div className="admin-thead admin-thead-waitlist">
          <div>User</div>
          <div>Provider</div>
          <div>Requested</div>
          <div>Decided</div>
          <div>Actions</div>
        </div>
        {loading && items.length === 0 && <div className="admin-row admin-empty">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="admin-row admin-empty">
            {q
              ? `No ${tab} entries match.`
              : tab === 'pending' ? 'No pending requests.' : `No ${tab} entries.`}
          </div>
        )}
        {items.map((entry) => (
          <div key={entry.id} className="admin-row admin-row-waitlist">
            <div className="admin-cell-user">
              <img className="admin-avatar" src={entry.avatarUrl} alt="" loading="lazy" />
              <div className="admin-cell-user-text">
                <div className="admin-cell-user-name">{entry.displayName}</div>
                <div className="admin-cell-user-email">{entry.email}</div>
                {entry.note && <div className="admin-note">note: {entry.note}</div>}
              </div>
            </div>
            <div data-label="Provider">
              <span className={`admin-pill admin-pill-${entry.provider}`}>{entry.provider}</span>
            </div>
            <div className="admin-cell-mono" data-label="Requested">{fmtDateTime(entry.requestedAt)}</div>
            <div className="admin-cell-mono" data-label="Decided">
              {entry.decidedAt ? fmtDateTime(entry.decidedAt) : '—'}
            </div>
            <div className="admin-row-actions">
              {tab === 'pending' ? (
                <>
                  <button className="btn-primary"
                    disabled={busyId === entry.id}
                    onClick={() => approve(entry)}
                  >
                    {busyId === entry.id ? '…' : 'Approve'}
                  </button>
                  <button className="btn-ghost"
                    disabled={busyId === entry.id}
                    onClick={() => reject(entry)}
                  >
                    Reject
                  </button>
                </>
              ) : (
                <span className="admin-sub">{entry.status}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <Pager total={total} pageSize={PAGE} offset={offset} loading={loading} onPage={(o) => void load(o)} />
    </div>
  )
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { year: '2-digit', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
