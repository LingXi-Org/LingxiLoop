import { Button } from '@/components/ui/button'
/**
 * In-app notification toasts. Shown when a new message arrives while the
 * window is NOT focused (or the user is viewing a different conversation).
 * Deliberately NOT using the OS native notification API — we want a stack
 * that matches LingxiLoop's palette (sky / coral / cloud / paper) and animates
 * with the rest of the app.
 *
 * Behaviour:
 * - Toasts stack from the top-right of the window.
 * - Each carries: author avatar + name + conversation title + body preview.
 * - Coalescing: a second message from the SAME conversation merges into the
 *   existing toast (bumps the count instead of stacking duplicates).
 * - Auto-dismiss after 6s. Hover pauses the timer.
 * - Click → focuses the window (best-effort) + selects that conversation
 *   + dismisses the toast.
 * - Soft de-dup: never toast messages authored by the current user.
 */
import { useEffect, useRef, useState } from 'react'
import { ws } from '@/api/core/realtime'
import { useApp } from '@/stores/app'
import { useMe } from '@/stores/auth'
import { isMuted, useConversations } from '@/features/conversations/store'
import { useParticipants } from '@/features/agents/state'
import {
  chatTransport,
  getLingxiMessageMetadata,
  messageText,
  serializeThreadMessage,
} from '@/features/chat/runtime'
import { isElectron } from '@/lib/runtime'
import { playNotificationChime } from '@/lib/chime'
import { Avatar } from './Avatar'
import { ICalendar } from './icons'

const AUTO_DISMISS_MS = 12_000
const MAX_TOASTS = 5

interface Toast {
  /** Stable id we use for React key + dismissal lookup. */
  id: string
  /** What surface this toast points at — drives the click handler. */
  kind: 'message' | 'doc.mention' | 'calendar.reminder'
  /** Set when kind === 'message'. The conversation the message belongs to. */
  conversationId?: string
  /** Set when kind === 'doc.mention'. The doc that was mentioned in. */
  documentId?: string
  /** Set when kind === 'calendar.reminder'. The calendar_event id; the
   *  click handler opens Calendar view and (in a follow-up) could deep
   *  link to this specific event. */
  eventId?: string
  /** ISO timestamp the calendar event is about to fire (reminder only). */
  occurrenceAt?: string
  /** "Heads-up in N minutes" — captured at toast time so the copy stays
   *  truthful even after a few seconds tick by. */
  leadMinutes?: number
  /** Identity of the most recent author (avatar/name shown). Unused for
   *  reminder toasts — we render a calendar icon instead of an avatar. */
  authorId: string
  /** Most recent message body (we replace older bodies on coalesce). */
  body: string
  /** Conversation title (message kind) OR doc title (mention kind) OR
   *  event title (reminder), captured at toast-creation time. */
  conversationTitle: string
  /** Wall-clock time of the most recent message. */
  at: number
  /** Number of distinct messages folded into this toast. */
  count: number
}

/** Renderer-side cache of the main window's native OS focus state,
 *  updated by `lingxiloop.app.onFocusChange`. We trust this over
 *  `document.hasFocus()` because the latter can return stale `true`
 *  values in Electron on macOS, suppressing notifications incorrectly.
 *  Seeded from `lingxiloop.app.isFocused()` at mount; pessimistic default
 *  of `true` avoids a half-second window of spurious toasts. */
let nativeAppFocused = true

/** Quick visibility check — works in both browser and Electron renderer.
 *  In Electron we trust the native focus state populated by IPC. */
function isWindowAttentive(): boolean {
  if (typeof document === 'undefined') return true
  if (document.visibilityState === 'hidden') return false
  if (isElectron) return nativeAppFocused
  if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false
  return true
}

export function NotificationToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const meId = useMe()
  const selectedId = useApp((s) => s.selectedConversationId)
  const view = useApp((s) => s.view)
  const select = useApp((s) => s.selectConversation)
  const setView = useApp((s) => s.setView)
  // Keep these latest values in refs so the WS subscriber (captured once)
  // always reads fresh state without resubscribing on every render.
  const meRef = useRef(meId)
  const focusRef = useRef({ selectedId, view })
  const seenMentionDeliveriesRef = useRef(new Set<string>())
  useEffect(() => { meRef.current = meId }, [meId])
  useEffect(() => { focusRef.current = { selectedId, view } }, [selectedId, view])

  // Keep the renderer-side `nativeAppFocused` cache in sync with the
  // main process. This is the source of truth for `isWindowAttentive()`
  // when running in Electron — `document.hasFocus()` can lie there.
  useEffect(() => {
    if (!isElectron) return
    const bridge = window.lingxiloop?.app
    if (!bridge) return
    // Seed from the current main-window focus state at mount, then keep
    // in sync with the main process's 500ms focus heartbeat.
    void bridge.isFocused().then((f) => { nativeAppFocused = f }).catch(() => { /* swallow */ })
    return bridge.onFocusChange((focused) => { nativeAppFocused = focused })
  }, [])

  useEffect(() => {
    const offMessage = chatTransport.subscribeMessages((message) => {
      const metadata = getLingxiMessageMetadata(message)
      // Never toast our own messages.
      if (metadata.senderId === meRef.current) return

      // Skip system rows (joined / left / kicked / etc.) — their body is a
      // structured JSON payload, not prose. The convo already renders them
      // as centered italic context lines; popping a toast that shows the
      // raw JSON (with an authorId that's actually the subject, not a
      // sender) is worse than silent.
      if (metadata.senderKind === 'system') return

      // Notifications fire ONLY when the app is NOT in the foreground.
      // When the user is actively looking at the app, the new message
      // lands in the visible thread — no toast needed regardless of
      // which conversation they're viewing.
      if (isWindowAttentive()) return

      // Only toast for conversations the user is actually a member of.
      // The WS bridge fans out CH_MESSAGE_NEW for every message in the
      // user's company, including conversations they are not a member of.
      // Those must never produce toast notifications.
      const convo = useConversations.getState().list.find((c) => c.id === metadata.conversationId)
      if (!convo) return
      if (isMuted(convo)) return
      const title = convo.title
      const at = Date.now()
      const body = messageText(message) || '（无内容）'
      // The conversation list comes from the API; `unread` is the
      // server's snapshot at last poll. The just-arrived message bumps
      // that by one in spirit, so add 1 here. Snapshot, not subscribed —
      // we don't want stale toasts to retroactively change badge.
      const unreadCount = (convo.unread ?? 0) + 1

      // In Electron: forward to the dedicated notification BrowserWindow
      // that lives top-right of the primary display (see
      // electron/main.cjs). The chime fires from THAT renderer (synced
      // with the toast paint) — not here, so the bell + visual land
      // together instead of the bell preceding the toast by ~300ms.
      const bridge = window.lingxiloop?.notify
      if (isElectron && bridge) {
        bridge.push({
          id: `toast-${message.id}-${at}`,
          message: serializeThreadMessage(message),
          conversationTitle: title,
          at,
          unreadCount,
        })
        return
      }

      // Plain-web fallback: keep the in-app top-right stack. Not screen-
      // level, but better than nothing in a browser tab. The chime fires
      // here because the browser path has no separate notif window to
      // own the bell.
      setToasts((prev) => {
        const idx = prev.findIndex((t) => t.kind === 'message' && t.conversationId === metadata.conversationId)
        if (idx >= 0) {
          const next = prev.slice()
          next[idx] = {
            ...next[idx], authorId: metadata.senderId, body,
            at, count: next[idx].count + 1, conversationTitle: title,
          }
          return next
        }
        queueMicrotask(playNotificationChime)
        const fresh: Toast = {
          id: `toast-${message.id}-${at}`,
          kind: 'message',
          conversationId: metadata.conversationId,
          authorId: metadata.senderId,
          body,
          conversationTitle: title,
          at, count: 1,
        }
        const merged = [fresh, ...prev]
        return merged.length > MAX_TOASTS ? merged.slice(0, MAX_TOASTS) : merged
      })
    })

    // ============ doc.mention toasts ============
    // Doc @-mentions live in the same toast stack but click into the
    // Documents view (not Conversations) and bypass the "is the window
    // attentive" gate — if a teammate just @-mentioned you, you want
    // to know even if you happen to be looking at this app right now
    // (your eyes might be in a different view).
    const offMention = ws.on((e) => {
      if (e.type !== 'doc.mention') return
      // Drop self-mentions defensively (the server should also filter
      // these, but a stale build of the server might not).
      if (e.mentionerId === meRef.current) return
      // Only fire when the current user is on the mentioned list.
      if (!e.mentionedIds.includes(meRef.current ?? '')) return
      // Delivery retries intentionally reuse the same durable id. Suppress a
      // replay before it can increment a toast or ring the notification chime.
      const seenDeliveries = seenMentionDeliveriesRef.current
      if (seenDeliveries.has(e.deliveryId)) return
      seenDeliveries.add(e.deliveryId)
      if (seenDeliveries.size > 256) {
        const oldest = seenDeliveries.values().next().value
        if (oldest) seenDeliveries.delete(oldest)
      }
      const at = Date.now()
      setToasts((prev) => {
        const idx = prev.findIndex((t) => t.kind === 'doc.mention' && t.documentId === e.documentId)
        if (idx >= 0) {
          const next = prev.slice()
          next[idx] = {
            ...next[idx], authorId: e.mentionerId,
            at, count: next[idx].count + 1,
            conversationTitle: e.documentTitle,
            body: `${e.mentionerName} 在“${e.documentTitle}”中提到了你`,
          }
          return next
        }
        queueMicrotask(playNotificationChime)
        const fresh: Toast = {
          id: `toast-mention-${e.documentId}-${at}`,
          kind: 'doc.mention',
          documentId: e.documentId,
          authorId: e.mentionerId,
          body: `${e.mentionerName} 在“${e.documentTitle}”中提到了你`,
          conversationTitle: e.documentTitle,
          at, count: 1,
        }
        const merged = [fresh, ...prev]
        return merged.length > MAX_TOASTS ? merged.slice(0, MAX_TOASTS) : merged
      })
    })

    // ============ calendar.reminder toasts ============
    // Calendar reminders bypass the attentive-window gate too — they're
    // explicitly scheduled by the user (or an agent on their behalf), so
    // popping while the app is foreground is exactly the desired UX.
    // Filter: only show if the current user is in `recipientUserIds`.
    const offReminder = ws.on((e) => {
      if (e.type !== 'calendar.reminder') return
      const me = meRef.current
      if (!me || !e.recipientUserIds.includes(me)) return
      const at = Date.now()
      setToasts((prev) => {
        // Coalesce against same eventId so a duplicate publish (multi-
        // tab WS sub) merges instead of stacking.
        const idx = prev.findIndex((t) => t.kind === 'calendar.reminder' && t.eventId === e.eventId)
        if (idx >= 0) {
          const next = prev.slice()
          next[idx] = { ...next[idx], at, count: next[idx].count + 1 }
          return next
        }
        queueMicrotask(playNotificationChime)
        const inText = e.leadMinutes <= 1
          ? '即将开始'
          : e.leadMinutes < 60
            ? `${e.leadMinutes} 分钟后开始`
            : `${Math.round(e.leadMinutes / 60)} 小时后开始`
        const fresh: Toast = {
          id: `toast-reminder-${e.eventId}-${at}`,
          kind: 'calendar.reminder',
          eventId: e.eventId,
          occurrenceAt: e.occurrenceAt,
          leadMinutes: e.leadMinutes,
          authorId: '',                          // unused — calendar icon shown
          body: inText,
          conversationTitle: e.title,
          at, count: 1,
        }
        const merged = [fresh, ...prev]
        return merged.length > MAX_TOASTS ? merged.slice(0, MAX_TOASTS) : merged
      })
    })

    // Electron: chime is played from the MAIN WINDOW (always loaded,
    // zero boot delay) the instant main signals the notification panel
    // is on screen. Firing from inside the notification window's React
    // mount lagged the visible toast by ~300ms in dev because the
    // panel renderer has to boot Vite + React on each push.
    const offVisible = window.lingxiloop?.notify?.onVisible(() => {
      playNotificationChime()
    })

    // Electron: subscribe to focus-convo requests from the notification
    // window. When the user clicks a toast over there, this fires here
    // and selects the conversation.
    const offFocus = window.lingxiloop?.notify?.onFocusConvo((conversationId) => {
      setView('conversations')
      select(conversationId)
    })

    return () => {
      offMessage()
      offMention()
      offReminder()
      offFocus?.()
      offVisible?.()
    }
  }, [select, setView])

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))
  const onClick = (t: Toast) => {
    // Best-effort focus the window. In Electron renderer, window.focus()
    // forwards to BrowserWindow.focus() on most platforms. If the window
    // is already visible-but-unfocused this brings it forward.
    try { window.focus() } catch { /* ignore */ }
    if (t.kind === 'doc.mention' && t.documentId) {
      setView('library')
      // Lazy-import to avoid pulling the documents store into every
      // boot path even when the user never visits the docs view.
      void import('@/features/documents/state').then(({ useDocuments }) => {
        useDocuments.getState().select(t.documentId!)
      })
    } else if (t.kind === 'calendar.reminder') {
      // Jump to Calendar. Deep-linking to the specific event is a
      // follow-up — Calendar will scroll to the day on load anyway.
      setView('calendar')
    } else if (t.conversationId) {
      setView('conversations')
      select(t.conversationId)
    }
    dismiss(t.id)
  }

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed z-[100] flex flex-col gap-2 pointer-events-none"
      style={{ top: 60, right: 18, maxWidth: 340 }}
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onClick={() => onClick(t)} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  )
}

function ToastCard({ toast, onClick, onDismiss }: { toast: Toast; onClick: () => void; onDismiss: () => void }) {
  const byId = useParticipants((s) => s.byId)
  const author = byId[toast.authorId]
  const [hovered, setHovered] = useState(false)
  // Auto-dismiss timer that pauses on hover.
  useEffect(() => {
    if (hovered) return
    const start = toast.at
    const elapsed = Date.now() - start
    const remaining = Math.max(800, AUTO_DISMISS_MS - elapsed)
    const id = window.setTimeout(onDismiss, remaining)
    return () => window.clearTimeout(id)
  }, [hovered, toast.at, onDismiss])

  return (
    <Button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="text-left animate-rise pointer-events-auto"
      style={{
        // Browser-fallback (no Electron notification window). Floats over
        // the app's own UI, so backdrop-filter genuinely blurs the chat
        // beneath the toast. Slightly translucent preset surface so the frost
        // reads, opaque enough that text never loses contrast.
        background: 'color-mix(in srgb, var(--card) 82%, transparent)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: 14,
        padding: '10px 12px 12px',
        // Preset-derived shadow + 1px hairline — matches the rest of
        // LingxiLoop's "lifted-card" treatment elsewhere in the app.
        boxShadow: '0 18px 40px -14px color-mix(in srgb, var(--foreground) 24%, transparent), 0 6px 14px -8px color-mix(in srgb, var(--foreground) 14%, transparent), 0 0 0 1px color-mix(in srgb, var(--card-foreground) 8%, transparent) inset',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        minWidth: 280,
        maxWidth: 340,
        // Subtle running underline to telegraph the auto-dismiss countdown.
        // The bar drains right-to-left over AUTO_DISMISS_MS.
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div className="flex items-start gap-2.5">
        {toast.kind === 'calendar.reminder' ? (
          // Reminder toasts: skype-tinted calendar tile in place of avatar.
          // The author slot is meaningless for these (the "sender" is the
          // scheduler), so we render an icon chip that visually anchors the
          // reminder as system-originated.
          <div
            className="w-8 h-8 rounded-full grid place-items-center shrink-0"
            style={{ background: 'var(--sky-100)', color: 'var(--skype-deep)' }}
          >
            <ICalendar className="w-4 h-4" />
          </div>
        ) : author ? (
          <Avatar p={author} size={32} ringColor="var(--cloud)" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-ink-100 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[12.5px] font-semibold text-ink-900 truncate">
              {toast.kind === 'calendar.reminder' ? toast.conversationTitle : (author?.name ?? '成员')}
            </span>
            <span className="text-[10.5px] text-ink-300 italic font-display truncate">
              {toast.kind === 'calendar.reminder' ? "日历提醒" : toast.conversationTitle}
            </span>
            {toast.count > 1 && (
              <span
                className="ml-auto text-[9.5px] font-bold py-px px-1.5 rounded-full shrink-0"
                style={{ background: 'var(--sky-100)', color: 'var(--skype-deep)' }}
                title={`本对话还有 ${toast.count - 1} 条消息`}
              >+{toast.count - 1} 更多</span>
            )}
          </div>
          <div
            className="text-[12.5px] text-ink-700 mt-0.5 leading-[1.4]"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {toast.body}
          </div>
        </div>
      </div>
      {/* Progress drain bar — visualizes the auto-dismiss countdown.
          Pauses (no animation) while hovered. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          height: 2,
          background: 'linear-gradient(90deg, var(--skype), var(--sky-glow))',
          transformOrigin: 'left center',
          animation: hovered ? 'none' : `lingxiloop-toast-drain ${AUTO_DISMISS_MS}ms linear forwards`,
        }}
      />
    </Button>
  )
}
