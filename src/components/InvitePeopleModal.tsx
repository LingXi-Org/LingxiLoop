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
import { api, type ApiInvitation, type ApiInvitationWithToken } from '@/api/client'
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
      const rows = await api.listInvitations(companyId)
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
      const inv = await api.createInvitation(companyId, payload)
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
    try {
      await api.revokeInvitation(companyId, id)
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
            Invite to {companyName}
          </h2>
          <div className="text-[12.5px] text-ink-500 italic font-display mt-0.5">
            Add humans to this workspace. Share a link or invite by email.
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
                  {t === 'link' ? 'Invite link' : 'By email'}
                </button>
              )
            })}
          </div>

          {/* Form */}
          {tab === 'email' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold tracking-wider uppercase text-ink-500 mb-1">
                  Email
                </label>
                <div className="text-[11.5px] text-ink-300 mb-1.5 font-display italic">
                  Single-use, locked to this address. They must sign in with the same email to redeem.
                </div>
                <input
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
                      Email this invite to them
                    </span>
                    <span className="block text-[11.5px] text-ink-400 font-display italic mt-0.5 leading-snug">
                      We'll send a short note from <b className="not-italic text-ink-600">invites@cumora.ai</b> with your name on it.
                      Replies go to your inbox. Uncheck if you'd rather share the link yourself.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}

          {tab === 'link' && (
            <div className="rounded-[10px] p-3 text-[12px] text-ink-500 font-display italic" style={{ background: 'var(--paper)', border: '1px dashed var(--ink-200)' }}>
              Anyone with the link can join. Use this for a small team — the link expires in 7 days and can be revoked anytime.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold tracking-wider uppercase text-ink-500 mb-1">
                Role
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
                      {r === 'member' ? 'Member' : 'Admin'}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold tracking-wider uppercase text-ink-500 mb-1">
                Note
                <span className="ml-1.5 text-ink-300 normal-case font-medium tracking-normal">— optional</span>
              </label>
              <input
                type="text"
                maxLength={120}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What's this invite for?"
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
              {busy ? 'Creating…'
                : tab === 'email' ? 'Create email invite'
                : 'Create invite link'}
            </button>
          </div>

          {/* Existing invitations */}
          <div className="pt-2">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-[12.5px] font-bold tracking-wide uppercase text-ink-500">
                Pending invitations
              </h3>
              <span className="text-[11px] text-ink-300">{activeInvitations.length}</span>
            </div>
            {loadingList && (
              <div className="text-[12px] text-ink-300 italic font-display py-4 text-center">loading…</div>
            )}
            {!loadingList && activeInvitations.length === 0 && (
              <div className="text-[12.5px] text-ink-400 italic font-display py-3">No pending invitations.</div>
            )}
            <div className="flex flex-col gap-1.5">
              {activeInvitations.map((inv) => (
                <InvitationRow key={inv.id} inv={inv} onRevoke={() => void revoke(inv.id)} />
              ))}
            </div>
            {historicalInvitations.length > 0 && (
              <details className="mt-3">
                <summary className="text-[11.5px] text-ink-400 cursor-pointer font-display italic hover:text-ink-600">
                  Show {historicalInvitations.length} past invitation{historicalInvitations.length === 1 ? '' : 's'}
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
            Invitations expire after 7 days.
          </div>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-[9px] text-[12.5px] font-semibold text-ink-700 bg-cloud hover:bg-sky2-50 transition"
            style={{ border: '1px solid var(--ink-100)' }}
          >Done</button>
        </div>
      </div>

      <style>{`
        .ip-input {
          width: 100%;
          padding: 8px 12px;
          font-size: 13.5px;
          background: var(--paper);
          border: 1.5px solid var(--ink-100);
          border-radius: 10px;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          color: var(--ink-900);
        }
        .ip-input:focus {
          border-color: var(--sky2-300);
          box-shadow: 0 0 0 3px var(--sky-50);
        }
      `}</style>
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
  const headline = delivery?.attempted && delivery.ok
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
          ? delivery?.attempted && delivery.ok
            ? <>Email delivered to <b className="not-italic text-ink-700">{invite.email}</b>. The link below is the same one we sent — copy it if you want to nudge them on another channel.</>
            : <>Locked to <b className="not-italic text-ink-700">{invite.email}</b> — they must sign in with that email.</>
          : <>Anyone with this link can join as a {invite.role}.</>}
      </div>
      {delivery && delivery.attempted && !delivery.ok && (
        <div className="text-[11.5px] py-1.5 px-2.5 rounded-[8px]"
             style={{ background: 'var(--coral-soft)', color: 'var(--coral-deep)', border: '1px solid var(--coral-deep)' }}>
          Email send failed: {delivery.error ?? 'unknown error'}. Copy the link and share it manually.
        </div>
      )}
      {delivery?.skipped === 'no_email_config' && (
        <div className="text-[11.5px] text-ink-500 py-1.5 px-2.5 rounded-[8px]"
             style={{ background: 'var(--cloud)', border: '1px dashed var(--ink-200)' }}>
          This server isn't set up for outbound email — copy the link and share it manually.
        </div>
      )}
      <div className="flex items-stretch gap-2">
        <input
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
        >{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div className="flex justify-end">
        <button
          onClick={onDone}
          className="text-[11.5px] text-ink-400 hover:text-ink-700 transition"
        >Dismiss</button>
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
    revoked:  { label: 'revoked', bg: 'var(--cloud)', fg: 'var(--ink-400)' },
    expired:  { label: 'expired', bg: 'var(--cloud)', fg: 'var(--ink-400)' },
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
            {inv.email ?? <span className="text-ink-500 italic font-display">Shareable link</span>}
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
          {inv.status === 'active' && <span>· expires {expiresDistance}</span>}
          {inv.status === 'consumed' && inv.lastAcceptedAt && (
            <span>· last accepted {relativeFrom(inv.lastAcceptedAt)}</span>
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
          >Revoke</button>
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
      title="Copy invite reference (the original link cannot be re-fetched — issue a new invite if you've lost it)"
      className="px-2 py-1.5 text-[11.5px] font-semibold rounded-[8px] transition"
      style={{ color: 'var(--ink-500)', border: '1px solid var(--ink-100)' }}
    >{copied ? 'Copied' : 'Copy ref'}</button>
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
