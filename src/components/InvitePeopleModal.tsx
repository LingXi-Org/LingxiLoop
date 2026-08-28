/**
 * Modal for inviting humans to a company workspace.
 *
 * Two flows surfaced from the same modal:
 *   1. **Shareable link** — mint a long-lived multi-use invite the owner
 *      can paste into Slack / iMessage / wherever. No email required.
 *   2. **By email**       — mint a single-use invite locked to a specific
 *      address. The owner copies the link and sends it themselves
 *      (we don't run an SMTP relay).
 *
 * Below the form, a live list of existing invitations with copy / revoke
 * affordances so the owner can audit who they've invited.
 *
 * Only company owners/admins reach this screen — the backend enforces it
 * with 403 on every endpoint, and the UI hides the entry points for
 * regular members.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { companiesApi } from '@/api/companies'
import type { ApiInvitation, ApiInvitationWithToken } from '@/api/contracts'
import { Input } from '@/components/ui/input'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { useAuth } from '@/stores/auth'

interface Props {
  companyId: string
  companyName: string
  onClose: () => void
}

type Tab = 'link' | 'email'

export function InvitePeopleModal({ companyId, companyName, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('link')
  const [list, setList] = useState<ApiInvitation[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listErr, setListErr] = useState<string | null>(null)

  // Form state
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'admin'>('member')
  const [note, setNote] = useState('')
  // Email-tab checkbox: ask the server to send the invite as an email on
  // the inviter's behalf. Only meaningful on the email tab (a shareable
  // link has no recipient). Default ON when the server has outbound
  // email configured; the checkbox is hidden entirely otherwise.
  const [sendEmail, setSendEmail] = useState(true)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const emailCapable = useAuth((s) => s.serverCapabilities?.invitationEmail === true)
  /** The just-created invite, kept around so the owner can copy the URL.
   *  Cleared on tab switch or on close. */
  const [created, setCreated] = useState<ApiInvitationWithToken | null>(null)

  const reload = useCallback(async () => {
    setLoadingList(true); setListErr(null)
    try {
      const rows = await companiesApi.listInvitations(companyId)
      setList(rows)
    } catch (e) {
      setListErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingList(false)
    }
  }, [companyId])

  useEffect(() => { void reload() }, [reload])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    setFormErr(null); setCreated(null)
    if (tab === 'email') {
      const trimmed = email.trim()
      if (!trimmed) { setFormErr('add an email'); return }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setFormErr('invalid email'); return }
    }
    setBusy(true)
    try {
      const payload = tab === 'email'
        ? { email: email.trim(), role, note: note.trim() || null, sendEmail: emailCapable && sendEmail }
        : { multiUse: true, role, note: note.trim() || null }
      const inv = await companiesApi.createInvitation(companyId, payload)
      setCreated(inv)
      setEmail(''); setNote('')
      void reload()
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id: string) => {
    if (!await confirmSensitiveAction({
      title: '撤销邀请？',
      description: '撤销后，此邀请链接将立即失效且无法再被兑换。',
      confirmLabel: '撤销邀请',
      tone: 'destructive',
    })) return
    try {
      await toastAction(companiesApi.revokeInvitation(companyId, id), { loading: '正在撤销邀请', success: '邀请已撤销', error: '撤销邀请失败' })
      void reload()
    } catch (e) {
      setListErr(e instanceof Error ? e.message : String(e))
    }
  }

  const activeInvitations = useMemo(() => list.filter((i) => i.status === 'active'), [list])
  const historicalInvitations = useMemo(() => list.filter((i) => i.status !== 'active'), [list])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: 'rgba(15, 30, 50, 0.55)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="bg-cloud rounded-[18px] shadow-pop w-full max-w-[600px] max-h-[88vh] flex flex-col overflow-hidden"
        style={{ border: '1px solid var(--ink-100)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-ink-100 shrink-0">
          <h2 className="font-display font-medium text-[20px] tracking-tight">
            邀请参加 {companyName}
          </h2>
          <div className="text-[12.5px] text-ink-500 italic font-display mt-0.5">
            将人员添加到此工作区。通过电子邮件分享链接或邀请。
          </div>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0 space-y-5">
          {/* Tabs */}
          <div className="inline-flex rounded-[10px] p-0.5 bg-paper" style={{ border: '1px solid var(--ink-100)' }}>
            {(['link', 'email'] as const).map((t) => {
              const on = tab === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTab(t); setCreated(null); setFormErr(null) }}
                  className="px-3 py-1.5 text-[12.5px] font-semibold rounded-[8px] transition"
                  style={{
                    background: on ? 'var(--skype)' : 'transparent',
                    color: on ? 'white' : 'var(--ink-500)',
                  }}
                >
                  {t === 'link' ? "邀请链接" : "通过电子邮件"}
                </button>
              )
            })}
          </div>

          {/* Form */}
          {tab === 'email' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold tracking-wider uppercase text-ink-500 mb-1">
                  电子邮件
                </label>
                <div className="text-[11.5px] text-ink-300 mb-1.5 font-display italic">
                  一次性使用，锁定到该地址。他们必须使用同一电子邮件登录才能兑换。
                </div>
                <Input
                  type="email"
                  autoFocus
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  className="ip-input"
                />
              </div>

              {emailCapable && (
                <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-[10px] px-3 py-2.5 transition"
                       style={{ background: 'var(--paper)', border: '1px solid var(--ink-100)' }}>
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                    className="mt-0.5 accent-[color:var(--skype)] w-[15px] h-[15px] cursor-pointer"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12.5px] font-semibold text-ink-800">
                      通过电子邮件将此邀请发送给他们
                    </span>
                    <span className="block text-[11.5px] text-ink-400 font-display italic mt-0.5 leading-snug">
                      我们将发送一条短信 <b className="not-italic text-ink-600">LingxiLoop 邀请</b>，其中会显示你的名字。
                      回复将发送至您的收件箱。如果您愿意自己分享链接，请取消选中。
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}

          {tab === 'link' && (
            <div className="rounded-[10px] p-3 text-[12px] text-ink-500 font-display italic" style={{ background: 'var(--paper)', border: '1px dashed var(--ink-200)' }}>
              知道链接的任何人都可以加入。将此用于小型团队 - 该链接将在 7 天后过期，并且可以随时撤销。
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold tracking-wider uppercase text-ink-500 mb-1">
                角色
              </label>
              <div className="flex gap-1.5">
                {(['member', 'admin'] as const).map((r) => {
                  const on = role === r
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold transition"
                      style={{
                        background: on ? 'var(--ink-700)' : 'var(--paper)',
                        color: on ? 'white' : 'var(--ink-500)',
                        border: '1px solid var(--ink-100)',
                      }}
                    >
                      {r === 'member' ? "会员" : "管理员"}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold tracking-wider uppercase text-ink-500 mb-1">
                注意
                <span className="ml-1.5 text-ink-300 normal-case font-medium tracking-normal">— 可选</span>
              </label>
              <Input
                type="text"
                maxLength={120}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="这个邀请有什么用？"
                className="ip-input"
              />
            </div>
          </div>

          {formErr && (
            <div className="text-[12.5px] text-coral-deep bg-coral-soft py-2 px-3 rounded-lg">
              {formErr}
            </div>
          )}

          {created && <CreatedInviteCard invite={created} onDone={() => setCreated(null)} />}

          <div>
            <button
              onClick={submit}
              disabled={busy}
              className="w-full py-2.5 rounded-[10px] text-[13px] font-semibold text-white transition disabled:opacity-50"
              style={{
                background: 'var(--skype)',
                boxShadow: '0 4px 12px -3px rgba(0, 168, 240, 0.5)',
              }}
            >
              {busy ? "正在创建..."
                : tab === 'email' ? "创建电子邮件邀请"
                : "创建邀请链接"}
            </button>
          </div>

          {/* Existing invitations */}
          <div className="pt-2">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-[12.5px] font-bold tracking-wide uppercase text-ink-500">
                待处理的邀请
              </h3>
              <span className="text-[11px] text-ink-300">{activeInvitations.length}</span>
            </div>
            {loadingList && (
              <ResourceSkeleton variant="list" count={3} compact label="正在加载邀请" />
            )}
            {!loadingList && activeInvitations.length === 0 && (
              <div className="text-[12.5px] text-ink-400 italic font-display py-3">没有待处理的邀请。</div>
            )}
            <div className="flex flex-col gap-1.5">
              {activeInvitations.map((inv) => (
                <InvitationRow key={inv.id} inv={inv} onRevoke={() => void revoke(inv.id)} />
              ))}
            </div>
            {historicalInvitations.length > 0 && (
              <details className="mt-3">
                <summary className="text-[11.5px] text-ink-400 cursor-pointer font-display italic hover:text-ink-600">
                  显示 {historicalInvitations.length} 过去的邀请{historicalInvitations.length === 1 ? '' : 's'}
                </summary>
                <div className="flex flex-col gap-1.5 mt-2">
                  {historicalInvitations.map((inv) => (
                    <InvitationRow key={inv.id} inv={inv} historical />
                  ))}
                </div>
              </details>
            )}
            {listErr && (
              <div className="text-[12.5px] text-coral-deep mt-2">{listErr}</div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-ink-100 flex items-center gap-2 bg-paper shrink-0">
          <div className="text-[11.5px] text-ink-300 italic font-display">
            邀请将在 7 天后过期。
          </div>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-[9px] text-[12.5px] font-semibold text-ink-700 bg-cloud hover:bg-sky2-50 transition"
            style={{ border: '1px solid var(--ink-100)' }}
          >完成</button>
        </div>
      </div>

      <style>{".ip-输入 {\n          宽度：100%；\n          内边距：8 像素 12 像素；\n          字体大小：13.5px；\n          背景：var(--paper);\n          边框：1.5px 实心 var(--ink-100);\n          边框半径：10px；\n          概要：无；\n          过渡：边框颜色0.15s，框阴影0.15s；\n          颜色：var(--ink-900)；\n        }\n        .ip-输入：焦点{\n          边框颜色：var(--sky2-300);\n          盒子阴影：0 0 0 3px var(--sky-50);\n        }"}</style>
    </div>
  )
}

function CreatedInviteCard({ invite, onDone }: { invite: ApiInvitationWithToken; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* swallow */ }
  }
  const delivery = invite.emailDelivery
  const headline = delivery?.ok
    ? 'Invite sent'
    : 'Invite ready to share'
  return (
    <div
      className="rounded-[12px] p-4 space-y-2"
      style={{
        background: 'linear-gradient(135deg, var(--sky-50), var(--paper))',
        border: '1.5px solid var(--sky2-300)',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full grid place-items-center text-white text-[11px] font-bold"
              style={{ background: 'var(--skype)' }}>✓</span>
        <div className="text-[13px] font-semibold text-ink-900">{headline}</div>
      </div>
      <div className="text-[11.5px] text-ink-500 italic font-display">
        {invite.email
          ? delivery?.ok
            ? <>电子邮件已发送至 <b className="not-italic text-ink-700">{invite.email}</b>。下面的链接与我们发送的链接相同 - 如果您想将它们推送到另一个频道，请复制该链接。</>
            : <>锁定至 <b className="not-italic text-ink-700">{invite.email}</b> — 他们必须使用该电子邮件登录。</>
          : <>知道此链接的任何人都可以作为 {invite.role}.</>}
      </div>
      <div className="flex items-stretch gap-2">
        <Input
          readOnly
          value={invite.url}
          className="flex-1 px-3 py-2 text-[12px] rounded-[8px] font-mono"
          style={{ background: 'var(--paper)', border: '1px solid var(--ink-100)', color: 'var(--ink-700)' }}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          onClick={copy}
          className="px-3 py-2 rounded-[8px] text-[12px] font-semibold text-white transition"
          style={{ background: copied ? 'var(--leaf-700, #2d8c72)' : 'var(--ink-700)' }}
        >{copied ? "已复制" : "复制"}</button>
      </div>
      <div className="flex justify-end">
        <button
          onClick={onDone}
          className="text-[11.5px] text-ink-400 hover:text-ink-700 transition"
        >驳回</button>
      </div>
    </div>
  )
}

function InvitationRow({
  inv,
  onRevoke,
  historical,
}: {
  inv: ApiInvitation
  onRevoke?: () => void
  historical?: boolean
}) {
  const expiresDistance = useMemo(() => relativeFrom(inv.expiresAt), [inv.expiresAt])
  const statusLabel: Record<typeof inv.status, { label: string; bg: string; fg: string }> = {
    active:   { label: inv.email ? 'awaiting' : 'shareable', bg: 'var(--sky-50)', fg: 'var(--sky2-700, #2466a5)' },
    revoked:  { label: "已撤销", bg: 'var(--cloud)', fg: 'var(--ink-400)' },
    expired:  { label: "已过期\n使用", bg: 'var(--cloud)', fg: 'var(--ink-400)' },
    consumed: { label: 'used',    bg: 'var(--cloud)', fg: 'var(--ink-400)' },
  }
  const pill = statusLabel[inv.status]
  return (
    <div
      className="rounded-[10px] p-2.5 flex items-center gap-3"
      style={{ background: 'var(--paper)', border: '1px solid var(--ink-100)', opacity: historical ? 0.7 : 1 }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-[13px] font-semibold text-ink-900 truncate">
            {inv.email ?? <span className="text-ink-500 italic font-display">可分享链接</span>}
          </div>
          <span
            className="px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
            style={{ background: pill.bg, color: pill.fg }}
          >{pill.label}</span>
          <span className="text-[10.5px] text-ink-400 uppercase tracking-wider font-bold">{inv.role}</span>
        </div>
        <div className="text-[11px] text-ink-400 mt-0.5 font-display italic flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {!inv.email && (
            <span>{inv.useCount}/{inv.maxUses} used</span>
          )}
          {inv.status === 'active' && <span>· 过期 {expiresDistance}</span>}
          {inv.status === 'consumed' && inv.lastAcceptedAt && (
            <span>·最后接受 {relativeFrom(inv.lastAcceptedAt)}</span>
          )}
          {inv.note && <span>· {inv.note}</span>}
        </div>
      </div>
      {inv.status === 'active' && !historical && onRevoke && (
        <div className="flex items-center gap-1.5">
          <CopyLinkButton inviteId={inv.id} />
          <button
            onClick={onRevoke}
            className="px-2 py-1.5 text-[11.5px] font-semibold rounded-[8px] transition"
            style={{ color: 'var(--coral-deep)', border: '1px solid var(--ink-100)' }}
          >撤销</button>
        </div>
      )}
    </div>
  )
}

/** The raw token is only ever returned from the create endpoint. After
 *  that the list endpoint only echoes the hash, so we can't show a
 *  copy-able URL for previously-issued invites — instead this button
 *  copies the invite's hash id as a debugging hint. (UX-wise we accept
 *  this limitation; the alternative is keeping plaintext tokens in DB,
 *  which we will not.) */
function CopyLinkButton({ inviteId }: { inviteId: string }) {
  const [copied, setCopied] = useState(false)
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(inviteId)
      setCopied(true); setTimeout(() => setCopied(false), 1200)
    } catch { /* swallow */ }
  }
  return (
    <button
      onClick={onClick}
      title="复制邀请参考（无法重新获取原始链接 - 如果您丢失了邀请，请发出新的邀请）"
      className="px-2 py-1.5 text-[11.5px] font-semibold rounded-[8px] transition"
      style={{ color: 'var(--ink-500)', border: '1px solid var(--ink-100)' }}
    >{copied ? "已复制" : "复制参考"}</button>
  )
}

function relativeFrom(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  const abs = Math.abs(ms)
  const past = ms < 0
  const minute = 60_000, hour = 60 * minute, day = 24 * hour
  const fmt = (n: number, unit: string) => `${n}${unit}${past ? ' ago' : ''}`
  if (abs < hour) return fmt(Math.max(1, Math.round(abs / minute)), 'm')
  if (abs < day) return fmt(Math.round(abs / hour), 'h')
  if (abs < 7 * day) return fmt(Math.round(abs / day), 'd')
  const w = Math.round(abs / (7 * day))
  return fmt(w, 'w')
}
