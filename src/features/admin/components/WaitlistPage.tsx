/**
 * Waitlist queue. Three sub-tabs: pending / approved / rejected.
 * Approve calls the server which provisions everything (user + company
 * then removes its row from the queue.
 */
import { useCallback, useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { adminApi } from '../api'
import type { AdminWaitlistEntry } from '../contracts'
import { Pager } from './Pager'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction, promptSensitiveAction } from '@/lib/confirmAction'

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
    if (!await confirmSensitiveAction({
      title: '批准候补用户？',
      description: `批准 ${entry.email} 将创建真实用户、工作区和服务账户。`,
      confirmLabel: '批准并创建账户',
      tone: 'warning',
    })) return
    setBusyId(entry.id)
    try {
      await toastAction(adminApi.approveWaitlist(entry.id), {
        loading: '正在批准候补用户',
        success: '用户已批准',
        error: '批准用户失败',
        description: entry.email,
      })
      await load(offset)
      onChanged()
    } catch { /* toast owns the visible error state */ } finally { setBusyId(null) }
  }

  const reject = async (entry: AdminWaitlistEntry) => {
    if (busyId) return
    const note = await promptSensitiveAction({
      title: '拒绝候补用户？',
      description: `${entry.email} 将从待审批队列中移除。可填写一条内部备注。`,
      confirmLabel: '拒绝申请',
      tone: 'destructive',
      inputLabel: '内部备注（可选）',
      inputDefaultValue: '',
      inputPlaceholder: '说明拒绝原因',
    })
    if (note === null) return
    setBusyId(entry.id)
    try {
      await toastAction(adminApi.rejectWaitlist(entry.id, note.trim() || undefined), {
        loading: '正在拒绝候补申请',
        success: '候补申请已拒绝',
        error: '拒绝申请失败',
        description: entry.email,
      })
      await load(offset)
      onChanged()
    } catch { /* toast owns the visible error state */ } finally { setBusyId(null) }
  }

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1 className="admin-h1">候补名单</h1>
          <div className="admin-sub">
            决定谁可以进入。端到端地批准帐户配置。
          </div>
        </div>
        <div className="admin-filters">
          <Input
            type="search"
            placeholder="电子邮件、姓名、提供商、注释"
            className="min-w-56"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </header>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList>
          <TabsTrigger value="pending">待处理</TabsTrigger>
          <TabsTrigger value="approved">已批准</TabsTrigger>
          <TabsTrigger value="rejected">已拒绝</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
        {err && <div className="admin-banner-err">{err}</div>}

        <div className="admin-table">
        <div className="admin-thead admin-thead-waitlist">
          <div>用户</div>
          <div>提供商</div>
          <div>已请求</div>
          <div>决定</div>
          <div>行动</div>
        </div>
        {loading && items.length === 0 && <ResourceSkeleton variant="table" count={6} className="p-3" label="正在加载候补名单" />}
        {!loading && items.length === 0 && (
          <div className="admin-row admin-empty">
            {q
              ? `No ${tab} entries match.`
              : tab === 'pending' ? "没有待处理的请求。" : `No ${tab} entries.`}
          </div>
        )}
        {items.map((entry) => (
          <div key={entry.id} className="admin-row admin-row-waitlist">
            <div className="admin-cell-user">
              {entry.avatarUrl ? <img className="admin-avatar" src={entry.avatarUrl} alt="" loading="lazy" /> : <span className="admin-avatar" />}
              <div className="admin-cell-user-text">
                <div className="admin-cell-user-name">{entry.displayName}</div>
                <div className="admin-cell-user-email">{entry.email}</div>
                {entry.note && <div className="admin-note">注意： {entry.note}</div>}
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
                  <Button
                    disabled={busyId === entry.id}
                    onClick={() => approve(entry)}
                  >
                    {busyId === entry.id ? '…' : "批准"}
                  </Button>
                  <Button variant="destructive"
                    disabled={busyId === entry.id}
                    onClick={() => reject(entry)}
                  >
                    拒绝
                  </Button>
                </>
              ) : (
                <span className="admin-sub">{entry.status}</span>
              )}
            </div>
          </div>
        ))}
        </div>

        <Pager total={total} pageSize={PAGE} offset={offset} loading={loading} onPage={(o) => void load(o)} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { year: '2-digit', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
