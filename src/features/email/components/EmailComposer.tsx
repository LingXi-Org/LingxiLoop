import { Button } from '@/components/ui/button'
/**
 * EmailComposer — slide-in drawer for writing real email.
 *
 * Two modes:
 *   - 'new'     : blank thread; user picks recipients (To/Cc), subject, body.
 *   - 'reply'   : pre-filled from an existing email message id; the SERVER
 *                 derives subject (Re:), In-Reply-To, References, and the
 *                 recipient list. The drawer just collects body + optional
 *                 extra Cc.
 *
 * Recipient picker accepts either a bare address or a participant id
 * (resolved server-side against the active company's agents + workspace
 * humans). Pills render with avatar when the id resolves to a known
 * participant.
 *
 * Submission: POSTs to /api/email/send or /api/email/reply/:id. On
 * success: closes drawer, navigates to the resulting thread, and
 * triggers a messages reload so the new bubble shows up. On failure:
 * keeps drawer open + surfaces error inline so the user can edit + retry.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { emailApi } from '../api'
import { uploadsApi } from '@/features/platform/api'
import { Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentGroup, AttachmentMedia, AttachmentTitle } from '@/components/ui/attachment'
import { Input } from '@/components/ui/input'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toastAction } from '@/lib/actionToast'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { useConversations } from '@/features/conversations/store'
import { useEmailComposer } from '../state'
import { useMessages } from '@/features/chat/state/messages'
import { useParticipants } from '@/features/agents/state'
import type { Message, Participant } from '@/types'
import { Avatar } from '@/components/Avatar'
import { IMail } from '@/components/icons'

/** Pending or completed file attachment in the composer. We track the
 *  upload lifecycle locally so the user gets immediate feedback (filename
 *  + spinner during upload, error state on failure) without round-tripping
 *  the server. Once `state==='done'`, the entry carries the storage key
 *  the send API needs. */
interface ComposerAttachment {
  /** Stable id for React keying; doubles as the upload's correlation id. */
  localId: string
  filename: string
  mimeType: string
  sizeBytes: number
  state: 'uploading' | 'done' | 'error'
  /** Set when state==='done'; the server-side storage key the send API
   *  references so Resend can fetch the file. */
  key?: string
  /** Set when state==='error'; surfaced inline next to the pill. */
  error?: string
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** A single recipient pill. `entry` is either an address string (external)
 *  or a Participant when the id resolved against the participants store —
 *  the avatar renders only in the latter case. */
interface RecipientEntry {
  raw: string
  display: string
  participant: Participant | null
}

function makeEntry(raw: string, byId: Record<string, Participant>): RecipientEntry {
  const trimmed = raw.trim()
  const p = byId[trimmed]
  if (p) return { raw: p.id, display: `${p.name}${p.email ? ` <${p.email}>` : ''}`, participant: p }
  return { raw: trimmed, display: trimmed, participant: null }
}

function PillField({
  label, entries, onChange, placeholder, autocompletePool,
}: {
  label: string
  entries: RecipientEntry[]
  onChange: (next: RecipientEntry[]) => void
  placeholder: string
  autocompletePool: Participant[]
}) {
  const [draft, setDraft] = useState('')
  const [openSuggest, setOpenSuggest] = useState(false)
  const byId = useParticipants((s) => s.byId)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Suggestions: pool members whose name / email contains the draft, minus
  // anything already in entries. Cap at 6 — more than that crowds the UI.
  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase()
    if (!q) return []
    const taken = new Set(entries.map((e) => e.raw))
    return autocompletePool
      .filter((p) => !taken.has(p.id) && (
        p.name.toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q)
      ))
      .slice(0, 6)
  }, [draft, entries, autocompletePool])

  const commit = (raw: string) => {
    const trimmed = raw.trim().replace(/[,;]+$/, '').trim()
    if (!trimmed) return
    if (entries.some((e) => e.raw === trimmed)) { setDraft(''); return }
    onChange([...entries, makeEntry(trimmed, byId)])
    setDraft('')
    setOpenSuggest(false)
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && draft === '' && entries.length > 0) {
      // Backspace at empty input pops the last pill — Slack/Gmail behavior.
      onChange(entries.slice(0, -1))
    } else if (e.key === 'Escape') {
      setOpenSuggest(false)
    }
  }

  return (
    <div className="email-composer-row relative grid grid-cols-[60px_1fr] items-start gap-2 px-4 py-2.5">
      <span className="pt-1.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-secondary">{label}</span>
      <div
        className="flex flex-wrap gap-1.5 items-center min-h-[28px] cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {entries.map((e) => (
          <span
            key={e.raw}
            className="inline-flex items-center gap-1 rounded-full border border-sky2-100 bg-sky2-50 py-0.5 pl-1 pr-1.5 text-[12px] text-skype-deep"
          >
            {e.participant && (
              <Avatar p={e.participant} size={18} ringColor="var(--raised)" />
            )}
            <span className="leading-none">{e.display}</span>
            <Button
              type="button"
              onClick={(ev) => { ev.stopPropagation(); onChange(entries.filter((x) => x.raw !== e.raw)) }}
              className="ml-0.5 text-ink-300 hover:text-coral-deep leading-none"
              aria-label={`Remove ${e.display}`}
            >×</Button>
          </span>
        ))}
        <Input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setOpenSuggest(true) }}
          onFocus={() => setOpenSuggest(Boolean(draft))}
          onKeyDown={onKey}
          onBlur={() => setTimeout(() => setOpenSuggest(false), 120)}
          placeholder={entries.length === 0 ? placeholder : ''}
          className="min-w-[140px] flex-1 border-0 bg-transparent text-[13px] text-ink placeholder:text-ink-secondary outline-none"
        />
      </div>
      {openSuggest && suggestions.length > 0 && (
        <div
          className="app-menu-surface absolute left-[72px] right-3 top-full z-10 mt-1 max-h-[220px] overflow-y-auto p-1"
        >
          {suggestions.map((p) => (
            <Button
              key={p.id}
              type="button"
              // mousedown not click — onBlur fires before click, eating the event.
              onMouseDown={(e) => { e.preventDefault(); commit(p.id) }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-raised"
            >
              <Avatar p={p} size={30} ringColor="var(--card)" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-ink-900 truncate">{p.name}</div>
                <div className="text-[11px] text-ink-500 truncate font-mono">{p.email ?? p.id}</div>
              </div>
              <span className="text-[9.5px] font-bold text-ink-300 uppercase tracking-wider">{p.kind}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

export function EmailComposer() {
  const compose = useEmailComposer((s) => s.composition)
  const close = useEmailComposer((s) => s.closeCompose)
  const select = useApp((s) => s.selectConversation)
  const setView = useApp((s) => s.setView)
  const byId = useParticipants((s) => s.byId)
  const me = useAuth((s) => s.user)

  // Reset on every open — different reply target / mode means fresh state.
  // Keying the entire component on `compose` would reset on every store
  // patch we don't care about, so reset explicitly via an effect instead.
  const [to, setTo] = useState<RecipientEntry[]>([])
  const [cc, setCc] = useState<RecipientEntry[]>([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const idempotencyKeyRef = useRef(crypto.randomUUID())
  // Drag-and-drop depth counter — incremented on dragenter, decremented
  // on dragleave. Counting (rather than a single boolean) handles the
  // browser firing dragleave when the cursor crosses between nested
  // children inside the drawer. MUST live above the `if (!open) return`
  // below — hook order has to be stable across renders, including the
  // closed-drawer renders where this hook would otherwise be skipped.
  const [dragDepth, setDragDepth] = useState(0)

  const open = compose !== null
  const isReply = compose?.mode === 'reply'

  // Reply context: when we're replying, find the original message in any
  // loaded conversation so the drawer can show "Re: <subject> · from <addr>".
  // No fetch — if it's not loaded, the preview just falls back to the id.
  const replyOriginal: Message | null = useMemo(() => {
    if (!isReply) return null
    const byConvo = useMessages.getState().byConvo
    for (const list of Object.values(byConvo)) {
      const hit = list.find((m) => m.id === compose.replyToMessageId)
      if (hit) return hit
    }
    return null
  }, [isReply, compose])

  useEffect(() => {
    if (!open) return
    setTo([]); setCc([]); setSubject(''); setBody('')
    setShowCc(false); setSending(false); setError(null)
    setAttachments([])
    idempotencyKeyRef.current = crypto.randomUUID()
  }, [open, compose?.mode, isReply ? compose.replyToMessageId : null])

  // Keep the controlled drawer root mounted while closed. The composer is
  // opened by business controls outside DrawerTrigger (menu items and reply
  // actions); mounting Root midway through that pointer event would let the
  // new dismiss layer interpret the opening click as an outside interaction.
  if (!open || !compose) return <Drawer open={false} direction="right" />

  // Autocomplete pool: every participant in this workspace EXCEPT the user
  // themselves. Filter to those with an email (agents always have one once
  // minted; humans get auth.email surfaced from /participants now).
  const pool: Participant[] = Object.values(byId).filter(
    (p) => p.id !== me?.id && p.email,
  )

  /** Upload one file in the background, updating its row in the
   *  attachments state as the lifecycle progresses. We don't gate the
   *  composer on upload completion — the user can keep typing while bytes
   *  fly; `submit` later refuses to send until every attachment is `done`. */
  const startUpload = (file: File) => {
    const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setAttachments((prev) => [
      ...prev,
      {
        localId,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        state: 'uploading',
      },
    ])
    void (async () => {
      try {
        const uploaded = await uploadsApi.uploadFile(file)
        setAttachments((prev) => prev.map((a) =>
          a.localId === localId
            ? { ...a, state: 'done', key: uploaded.key ?? '' }
            : a,
        ))
      } catch (e) {
        setAttachments((prev) => prev.map((a) =>
          a.localId === localId
            ? { ...a, state: 'error', error: e instanceof Error ? e.message : String(e) }
            : a,
        ))
      }
    })()
  }

  const removeAttachment = (localId: string) => {
    setAttachments((prev) => prev.filter((a) => a.localId !== localId))
  }

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    for (const f of files) startUpload(f)
    // Reset the input so picking the SAME file twice in a row re-fires.
    e.target.value = ''
  }

  // `dragDepth` is declared with the other hooks above so it stays in
  // the hook order even when the drawer is closed (open=false short-
  // circuits before this point). The boolean here is purely derived.
  const dragOver = dragDepth > 0

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    // Only react when the drag has files (not e.g. text selection or an
    // internal-DOM drag).
    if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return
    e.preventDefault()
    setDragDepth((n) => n + 1)
  }
  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return
    e.preventDefault()
    setDragDepth((n) => Math.max(0, n - 1))
  }
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return
    e.preventDefault()
    // dropEffect=copy gives the user the "+" cursor — clear signal that
    // releasing will attach, not move-or-link.
    e.dataTransfer.dropEffect = 'copy'
  }
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return
    e.preventDefault()
    setDragDepth(0)
    const files = Array.from(e.dataTransfer.files ?? [])
    for (const f of files) startUpload(f)
  }

  const submit = async () => {
    setError(null)
    if (!body.trim()) { setError('body is required'); return }
    if (!isReply) {
      if (to.length === 0) { setError('add at least one recipient'); return }
      if (!subject.trim()) { setError('subject is required'); return }
    }
    // Refuse to send while any attachment is still in flight or errored —
    // sending partial would silently drop files and confuse the recipient.
    const pending = attachments.filter((a) => a.state === 'uploading')
    const failed = attachments.filter((a) => a.state === 'error')
    if (pending.length > 0) { setError(`${pending.length} attachment(s) still uploading`); return }
    if (failed.length > 0) { setError(`remove failed attachments before sending`); return }
    const attachmentArgs = attachments
      .filter((a) => a.state === 'done' && a.key)
      .map((a) => ({ key: a.key!, filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes }))
    setSending(true)
    try {
      const sendPromise = isReply
        ? emailApi.replyEmail(compose.replyToMessageId, {
            idempotencyKey: idempotencyKeyRef.current,
            body: body.trim(),
            cc: cc.map((e) => e.raw),
            attachments: attachmentArgs.length ? attachmentArgs : undefined,
          })
        : emailApi.sendEmail({
            idempotencyKey: idempotencyKeyRef.current,
            to: to.map((e) => e.raw),
            cc: cc.length ? cc.map((e) => e.raw) : undefined,
            subject: subject.trim(),
            body: body.trim(),
            attachments: attachmentArgs.length ? attachmentArgs : undefined,
          })
      const result = await toastAction(Promise.resolve(sendPromise), {
        loading: isReply ? '正在发送邮件回复' : '正在发送邮件',
        success: isReply ? '邮件回复已发送' : '邮件已发送',
        error: isReply ? '发送邮件回复失败' : '发送邮件失败',
      })
      // Reload conversations + the affected thread's messages so the new
      // bubble appears immediately. The WS pubsub will also deliver the
      // `message.new` event but a hard reload is simpler than racing it.
      await useConversations.getState().reload()
      await useMessages.getState().reloadConversation(result.conversationId)
      setView('conversations')
      select(result.conversationId)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={(nextOpen) => { if (!nextOpen) close() }} direction="right">
      <DrawerContent
        className="email-composer-drawer w-[calc(100vw-1rem)] max-w-[660px] gap-0 overflow-hidden p-0"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {dragOver && (
          <div
            // Drop overlay: covers the drawer while dragging, with a
            // dashed outline + hint text. pointer-events-none so the
            // child drop target keeps receiving the event.
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none animate-fade-in"
            style={{
              background: 'color-mix(in srgb, var(--accent) 12%, var(--panel))',
              border: '2px dashed var(--skype)',
              animationDuration: '120ms',
            }}
          >
            <div
              className="flex items-center gap-2 rounded-xl border border-sky2-200 bg-raised px-5 py-3 text-[13px] font-semibold text-skype-deep shadow-xl"
            >
              📎 拖放以附加
            </div>
          </div>
        )}
        <DrawerHeader className="relative flex-row items-center gap-2.5 border-b border-hairline bg-card px-4 py-3.5 pr-14 text-left">
          <span className="grid size-8 place-items-center rounded-xl bg-sky2-100 text-skype-deep">
            <IMail className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <DrawerTitle className="text-[14px] font-semibold tracking-tight text-ink">
              {isReply ? "通过电子邮件回复" : "新电子邮件"}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              {isReply ? "撰写并发送邮件回复" : "撰写并发送新邮件"}
            </DrawerDescription>
          </div>
          <DrawerClose asChild>
            <Button
              type="button"
              className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-lg leading-none text-ink-secondary transition hover:bg-raised hover:text-ink"
              aria-label="关闭邮件编辑器"
            >×</Button>
          </DrawerClose>
        </DrawerHeader>

        {!isReply && (
          <PillField
            label="至"
            entries={to}
            onChange={setTo}
            placeholder="地址或@id，逗号添加"
            autocompletePool={pool}
          />
        )}
        {!isReply && (showCc || cc.length > 0 ? (
          <PillField
            label="抄送"
            entries={cc}
            onChange={setCc}
            placeholder="可选"
            autocompletePool={pool}
          />
        ) : (
          <div className="email-composer-row px-4 py-2 text-right">
            <Button
              type="button"
              onClick={() => setShowCc(true)}
              className="text-[11px] text-skype-deep hover:underline"
            >+ 抄送</Button>
          </div>
        ))}
        {!isReply && (
          <div className="email-composer-row grid grid-cols-[60px_1fr] items-center gap-2 px-4 py-3">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-secondary">主题</span>
            <Input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="这是关于什么的？"
              className="border-0 bg-transparent font-display text-[15px] text-ink placeholder:text-ink-secondary outline-none"
            />
          </div>
        )}
        {isReply && replyOriginal?.email && (
          <div className="email-composer-row bg-inset px-4 py-2.5 text-[11.5px] text-ink-secondary">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-ink-300 uppercase tracking-wider text-[10px]">回复：</span>
              <span className="text-ink-700 font-medium">{replyOriginal.email.subject || '(no subject)'}</span>
            </div>
            <div className="mt-0.5 truncate">
              来自 <span className="text-ink-700">{replyOriginal.email.from}</span>
            </div>
          </div>
        )}
        {isReply && (
          <PillField
            label="抄送"
            entries={cc}
            onChange={setCc}
            placeholder="将任何人添加到抄送（可选）"
            autocompletePool={pool}
          />
        )}

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={isReply ? "写下你的回复..." : "写下您的信息..."}
          className="email-composer-body m-3 flex-1 resize-none rounded-2xl border border-hairline bg-inset px-4 py-3.5 font-sans text-[14px] leading-[1.6] text-ink outline-none placeholder:text-ink-secondary"
          autoFocus
        />

        {attachments.length > 0 && (
          <AttachmentGroup className="mx-3 mb-2" role="group" aria-label="邮件附件" tabIndex={0}>
            {attachments.map((a) => (
              <Attachment key={a.localId} size="sm" state={a.state}>
                <AttachmentMedia>{a.state === 'uploading' ? '⏳' : a.state === 'error' ? '⚠️' : '📎'}</AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{a.filename}</AttachmentTitle>
                  <AttachmentDescription>
                    {a.mimeType} · {humanBytes(a.sizeBytes)}
                    {a.state === 'uploading' && ' · uploading…'}
                    {a.state === 'error' && ` · ${a.error ?? 'upload failed'}`}
                  </AttachmentDescription>
                </AttachmentContent>
                <AttachmentActions><AttachmentAction onClick={() => removeAttachment(a.localId)} aria-label={`移除 ${a.filename}`}>×</AttachmentAction></AttachmentActions>
              </Attachment>
            ))}
          </AttachmentGroup>
        )}

        {error && (
          <div className="mx-3 mb-2 rounded-xl border border-coral/25 bg-coral-soft px-4 py-2 text-[12px] text-coral-deep">
            {error}
          </div>
        )}

        <DrawerFooter className="email-composer-footer mt-auto flex-row items-center gap-2 border-t border-hairline bg-card px-4 py-3">
          <Input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={onFilePick}
            className="hidden"
          />
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className="rounded-xl border border-hairline bg-raised px-3 py-2 text-[12px] font-semibold text-ink transition hover:border-sky2-200 hover:text-skype-deep disabled:opacity-50"
            title="附加文件"
          >📎 附上</Button>
          <span className="text-[11px] text-ink-300 mr-auto">
            来自 <span className="font-mono text-ink-500">{me?.email ?? '(no auth email)'}</span>
          </span>
          <Button
            type="button"
            onClick={close}
            disabled={sending}
            className="rounded-xl px-3 py-2 text-[12px] font-semibold text-ink-secondary transition hover:bg-raised hover:text-ink disabled:opacity-50"
          >取消</Button>
          <Button
            type="button"
            onClick={submit}
            disabled={sending}
            className={cn(
              'rounded-xl bg-accent px-4 py-2 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50',
            )}
          >{sending ? "正在发送..." : isReply ? "发送回复" : "发送"}</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
