import { agentsApi } from '@/api/agents'
import { conversationsApi } from '@/api/conversations'
import { filesApi } from '@/api/files'
import type { ApiAttachment, ApiCoworkerActivity } from '@/api/contracts'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'
import { ws } from '@/api/core/realtime'
import { Avatar, AvatarStack } from '@/components/Avatar'
import { IAt, ICanvas, IClip, ISearch, ISend, ISmile } from '@/components/icons'
import { MessageRow } from '@/components/Message'
import { PollComposer } from '@/components/PollComposer'
import { PreviewText } from '@/components/PreviewText'
import { RichInput, type RichInputHandle } from '@/components/RichInput'
import { ScrollToLatestButton } from '@/components/ScrollToLatestButton'
import { SelectField } from '@/components/ui/select-field'
import { SkypeEmoji } from '@/components/SkypeEmoji'
import { TwEmoji } from '@/components/TwEmoji'
import { ComposerSurface } from '@/im/Composer'
import { ConversationHeader } from '@/im/ConversationHeader'
import { ConversationView } from '@/im/ConversationView'
import { MessageList } from '@/im/MessageList'
import { EVERYONE_BLOUB_PARTICIPANT } from '@/lib/agentVisualState'
import { staticBloubAvatarUrl } from '@/lib/bloub/staticAvatar'
import { isMockImDevelopment } from '@/lib/devMode'
import { COMPOSER_EMOJIS } from '@/lib/emoji'
import { isImeComposing } from '@/lib/keyboard'
import { applyFindHighlights, clearFindHighlights } from '@/lib/findHighlights'
import { findSkypeByShortcode, playSkypeSound, SKYPE_EMOJIS } from '@/lib/skypeEmojis'
import { cn } from '@/lib/utils'
import { projectFindMatches, projectTranscriptAdjacency } from '@/lib/transcriptExperience'
import { useApp } from '@/stores/app'
import { useConversationUi } from '@/stores/conversationUi'
import { useSurface } from '@/stores/surface'
import { useUiCommands } from '@/stores/uiCommands'
import { useMe } from '@/stores/auth'
import { useConversations } from '@/stores/conversations'
import type { MessagesState } from '@/stores/messages'
import { messagesFor, sendUserMessage, useMessages, VIRTUOSO_FIRST_INDEX_BASE } from '@/stores/messages'
import { useParticipants } from '@/stores/participants'
import { useSoundStore } from '@/stores/sound'
import type { Participant } from '@/types'

/** Soft "Coming soon" popover anchored beneath the trigger. Auto-dismisses
 *  after a beat; also closes on outside-click or Escape. The sparkle
 *  drifts gently so the bubble feels alive rather than static. */
function _ComingSoonPop({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    // Defer outside-click + key listeners by one tick so the click that
    // opened the bubble doesn't immediately close it again.
    let armed = false
    const arm = setTimeout(() => { armed = true }, 0)
    const auto = setTimeout(onClose, 3200)
    const onDown = () => { if (armed) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(arm)
      clearTimeout(auto)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute right-0 top-full mt-2 z-30 animate-rise"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="relative bg-cloud border border-ink-100 rounded-[14px] pl-3 pr-3.5 py-2.5 w-[260px]"
        style={{ boxShadow: '0 18px 38px -18px rgba(10, 30, 60, 0.28), 0 2px 8px -2px rgba(10, 30, 60, 0.06)' }}
      >
        {/* caret poking up out of the bubble's top edge */}
        <div
          aria-hidden
          className="absolute -top-[5px] right-6 w-2.5 h-2.5 bg-cloud rotate-45 border-l border-t border-ink-100"
        />
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden
            className="text-[18px] leading-none mt-px"
            style={{ animation: 'lingxiloop-sparkle-drift 2.4s ease-in-out infinite' }}
          >✨</span>
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-ink-900 leading-tight">Coming soon</div>
            <div className="text-[11.5px] text-ink-500 font-display italic leading-snug mt-0.5">
              Live working sessions are still on the way.
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes lingxiloop-sparkle-drift {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.95; }
          50%      { transform: translateY(-2px) rotate(8deg); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function _ChatHeader({
  convoId, onToggleSearch, searchOpen,
}: {
  convoId: string
  onToggleSearch: () => void
  searchOpen: boolean
}) {
  const c = useConversations((s) => s.list.find((x) => x.id === convoId))
  const byId = useParticipants((s) => s.byId)
  const [editingTopic, setEditingTopic] = useState(false)
  const [topicDraft, setTopicDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  if (!c) return null

  const memberPs = c.members
    .map((m) => byId[m])
    .filter((p): p is Participant => Boolean(p))
  const agentMembers = memberPs.filter((p) => p.kind === 'agent')
  const agentNames = agentMembers.map((p) => p.name).join(', ')
  const humanCount = memberPs.filter((p) => p.kind === 'human').length
  const activeAgentMembers = agentMembers.filter((p) => !p.departedAt)
  const changeLeader = async (leaderId: string) => {
    try { await useConversations.getState().setLeader(c.id, leaderId) }
    catch (error) { console.warn('[leader] update failed', error) }
  }

  // Group rename — only group chats; a DM/whisper title is derived from the
  // other person. Mirrors the topic editor (optimistic update + rollback).
  const canRename = c.kind === 'group'
  const startEditTitle = () => {
    if (!canRename) return
    setTitleDraft(c.title)
    setEditingTitle(true)
  }
  const saveTitle = async () => {
    const next = titleDraft.trim()
    setEditingTitle(false)
    if (!next || next === c.title) return
    try { await useConversations.getState().setTitle(c.id, next) }
    catch (err) { console.warn('[title] rename failed', err) }
  }

  const startEditTopic = () => {
    setTopicDraft(c.topic ?? '')
    setEditingTopic(true)
  }
  const saveTopic = async () => {
    const next = topicDraft.trim() || null
    setEditingTopic(false)
    // Optimistic local update — don't wait for the WS push to round-trip
    // before the chip reflects the new value. (Also defensive against any
    // future WS-filter regression that drops the conversation.updated event.)
    try { await useConversations.getState().setTopic(c.id, next) }
    catch (err) { console.warn('[topic] save failed', err) }
  }

  return (
    <div className="omb-titlebar-safe omb-drag flex min-h-[56px] items-center gap-4 px-5 py-2.5">
      <div className="omb-no-drag flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-0.5">
        <div className="hidden shrink-0 sm:block"><AvatarStack ps={agentMembers} size={28} max={3} /></div>
        <div className="min-w-0 flex-1">
        <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold leading-[1.35] text-ink">
          {/* Title truncates at narrow widths instead of wrapping to a
              second line — wrapping interacts badly with the topic input
              right beneath it. min-w-0 on the flex parents is what lets
              the text-overflow: ellipsis kick in. `truncate` sets
              overflow:hidden, so leading-[1.35] (≈25.6px on 19px text)
              is the minimum that preserves descenders on "g" / "p" /
              "y" inside the clipped box. */}
          {editingTitle ? (
            <input
              autoFocus
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void saveTitle() }
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              maxLength={80}
              className="min-w-0 flex-1 border-b border-accent bg-transparent pb-0.5 text-[15px] font-semibold text-ink outline-none"
            />
          ) : (
            <span
              className={cn('truncate', canRename && 'cursor-text hover:text-skype-deep transition')}
              title={canRename ? '点击重命名群聊' : c.title}
              onClick={canRename ? startEditTitle : undefined}
            >{c.title}</span>
          )}
        </h2>
        <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-secondary">
          <span className="truncate">{agentNames || '—'}</span>
          {humanCount > 0 && (
            <>
              <span className="w-1 h-1 rounded-full bg-ink-300 shrink-0" />
              <span className="shrink-0">+ {humanCount === 1 ? '你' : `${humanCount} 位成员`}</span>
            </>
          )}
          {c.kind === 'group' && activeAgentMembers.length > 0 && (
            <>
              <span className="w-1 h-1 rounded-full bg-ink-300 shrink-0" />
              <div className="flex shrink-0 items-center gap-1" title="普通消息由 Leader 主导回复">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-300">Leader</span>
                <SelectField
                  value={c.leaderId ?? ''}
                  onValueChange={(value) => void changeLeader(value)}
                  options={[
                    ...(!c.leaderId ? [{ value: '', label: '请选择', disabled: true }] : []),
                    ...activeAgentMembers.map((agent) => ({ value: agent.id, label: agent.name })),
                  ]}
                  className="max-w-[120px]"
                  triggerClassName="border-0 bg-transparent px-1 text-[11.5px] font-semibold text-skype-deep shadow-none"
                  size="compact"
                  ariaLabel="更换群聊 Leader"
                />
              </div>
            </>
          )}
          {!c.topic && !editingTopic && (
            <>
              <span className="w-1 h-1 rounded-full bg-ink-300 shrink-0" />
              <button
                onClick={startEditTopic}
                className="text-ink-300 italic font-display hover:text-skype-deep transition shrink-0"
                title="设置话题"
              >+ 话题</button>
            </>
          )}
        </div>
        {/* Topic — editable on click. Empty state's "+ topic" affordance lives
            inline in the subtitle above, so this row only renders when
            there's actual content or the input is open. */}
        {editingTopic ? (
          <input
            autoFocus
            type="text"
            value={topicDraft}
            onChange={(e) => setTopicDraft(e.target.value)}
            onBlur={saveTopic}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void saveTopic() }
              if (e.key === 'Escape') setEditingTopic(false)
            }}
            placeholder="这个群聊用于讨论什么？"
            className="mt-0.5 w-full bg-transparent text-[12px] text-ink-700 italic placeholder:text-ink-300 outline-none border-b border-sky2-200 focus:border-skype-deep transition pb-0.5"
            maxLength={200}
          />
        ) : c.topic ? (
          <button
            onClick={startEditTopic}
            // Italic glyphs lean past their box — without right padding,
            // `truncate`'s overflow:hidden chops the slanted edge of the
            // final character. pr-1 + max-w-full keeps the layout
            // honest while leaving room for the slant.
            className="mt-0.5 text-[12px] text-ink-500 italic hover:text-skype-deep transition truncate text-left max-w-full font-display pr-1 block leading-[1.5]"
            title="点击编辑话题"
          >
            {c.topic}
          </button>
        ) : null}
        </div>
      </div>
      <div className="omb-no-drag flex shrink-0 gap-1 text-ink-secondary">
        <button
          onClick={onToggleSearch}
          title="搜索当前会话"
          aria-label="搜索当前会话"
          className={cn(
            'grid size-8 place-items-center rounded-md transition',
            searchOpen ? 'bg-raised text-accent' : 'hover:bg-raised hover:text-ink',
          )}
        >
          <ISearch className="size-[18px]" />
        </button>
      </div>
    </div>
  )
}

/** Compact emoji palette for the composer's smile button. Two sections —
 *  Standard (unicode/Twemoji) and Skype (classic animated emoticons).
 *  Clicking inserts at the textarea caret: a unicode codepoint for the
 *  Standard tab, a `(name)` shortcode for the Skype tab (the message
 *  renderer recognizes the shortcode and substitutes the GIF).
 *  Closes on outside-click via the parent's `onClose` (wired below). */
type EmojiTab = 'std' | 'skype'
const EMOJI_TAB_STORAGE_KEY = 'lingxiloop.composer.emojiTab'

function readInitialEmojiTab(): EmojiTab {
  if (typeof window === 'undefined') return 'std'
  try {
    const v = window.localStorage.getItem(EMOJI_TAB_STORAGE_KEY)
    return v === 'skype' ? 'skype' : 'std'
  } catch { return 'std' }
}

function EmojiPopover({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  // Remember the last-used tab across opens (and across app restarts).
  // The persisted choice survives reloads — most users settle into one
  // mode and getting bounced back to "Standard" every open is annoying.
  const [tab, setTabState] = useState<EmojiTab>(readInitialEmojiTab)
  const setTab = (next: EmojiTab) => {
    setTabState(next)
    try { window.localStorage.setItem(EMOJI_TAB_STORAGE_KEY, next) } catch { /* private mode */ }
  }
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    // Defer one frame so the click that opened us doesn't immediately close us.
    const id = requestAnimationFrame(() => document.addEventListener('mousedown', onDoc))
    return () => {
      cancelAnimationFrame(id)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [onClose])
  return (
    <div
      ref={ref}
      className="app-menu-surface absolute bottom-full left-0 z-30 mb-2 px-2 py-2 animate-rise"
      style={{
        // Wider + taller in the Skype tab: 107 emoticons in 7 cols means
        // the user sees ~10 rows at once (still has to scroll for the
        // tail, but the panel doesn't read as "a handful").
        width: tab === 'skype' ? 332 : 260,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex gap-1 mb-2 px-0.5">
        {(['std', 'skype'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              'flex-1 text-[11px] font-semibold uppercase tracking-wider py-1 rounded-[6px] transition',
              tab === k ? 'bg-sky2-100 text-skype-deep' : 'text-ink-500 hover:bg-sky2-50',
            )}
          >{k === 'std' ? '常用表情' : 'LingxiLoop 表情'}</button>
        ))}
      </div>
      {tab === 'std' ? (
        <div className="grid grid-cols-6 gap-1">
          {COMPOSER_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => onPick(e)}
              className="h-8 w-8 rounded grid place-items-center hover:bg-sky2-50 transition"
              title={e}
            ><TwEmoji emoji={e} size={20} /></button>
          ))}
        </div>
      ) : (
        <div
          className="grid grid-cols-7 gap-1 max-h-[360px] overflow-y-auto pr-0.5"
        >
          {SKYPE_EMOJIS.map((e) => (
            <button
              key={e.key}
              onClick={() => {
                onPick(e.shortcodes[0])
                // Picker double-duty: insert into the composer AND play
                // a one-shot preview so the user hears what'll fire on
                // the recipient side. Mute toggle silences both paths.
                if (!useSoundStore.getState().muted) playSkypeSound(e.key)
              }}
              className="h-9 w-9 rounded grid place-items-center hover:bg-sky2-50 transition"
              title={`${e.label} — ${e.shortcodes[0]}`}
            ><SkypeEmoji name={e.key} size={26} autoPlaySound={false} /></button>
          ))}
        </div>
      )}
    </div>
  )
}

type ComposerDraftState = {
  text: string
  attachment: ApiAttachment | null
}

const EMPTY_COMPOSER_DRAFT: ComposerDraftState = { text: '', attachment: null }

function resolveDraftText(next: string | ((prev: string) => string), prev: string) {
  return typeof next === 'function' ? next(prev) : next
}

/**
 * Drives the local human's typing indicator. Two cadences run in parallel:
 *
 *   - **Throttle**: while the user keeps typing, we emit `done:false` at
 *     most once every ~3 s. The server-side typing store auto-clears after
 *     45 s, so a long compose session still needs the occasional re-ping
 *     to stay "alive" for late-joining viewers.
 *   - **Debounce**: 2 s after the last keystroke, we emit `done:true`. Same
 *     fire when the composer empties, the convo switches, the send button
 *     fires, or the component unmounts.
 *
 * Returns a `finalize()` callback the parent calls right before sending so
 * the typing indicator clears the moment the message lands, not 2 s later.
 */
function useTypingEmitter(convoId: string, text: string) {
  const stateRef = useRef<{ convoId: string; lastSentAt: number } | null>(null)
  const idleTimerRef = useRef<number | null>(null)

  const clearIdle = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [])

  const sendTyping = useCallback((targetConvoId: string, done: boolean) => {
    if (isMockImDevelopment()) return
    void conversationsApi.emitTyping(targetConvoId, done).catch((e) => {
      console.warn('[typing] emit failed', e)
    })
  }, [])

  const finalize = useCallback(() => {
    clearIdle()
    const cur = stateRef.current
    if (cur) {
      sendTyping(cur.convoId, true)
      stateRef.current = null
    }
  }, [clearIdle, sendTyping])

  // Drive the indicator off draft changes. We do this synchronously inside
  // a layout effect so a rapid type-then-send sequence still fires done.
  useEffect(() => {
    const trimmed = text.trim()
    if (!trimmed) {
      finalize()
      return
    }
    const now = Date.now()
    const cur = stateRef.current
    if (!cur || cur.convoId !== convoId) {
      // Finalize a stale session on the previous convo before starting fresh.
      if (cur) sendTyping(cur.convoId, true)
      sendTyping(convoId, false)
      stateRef.current = { convoId, lastSentAt: now }
    } else if (now - cur.lastSentAt > 3000) {
      sendTyping(convoId, false)
      cur.lastSentAt = now
    }
    clearIdle()
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null
      const live = stateRef.current
      if (live) {
        sendTyping(live.convoId, true)
        stateRef.current = null
      }
    }, 2000)
  }, [text, convoId, sendTyping, clearIdle, finalize])

  // On unmount or convoId change, finalize any lingering session.
  useEffect(() => () => finalize(), [finalize])

  return finalize
}

export function Composer({
  convoId,
  threadRootId = null,
  placeholder,
}: {
  convoId: string
  // When set, this composer sends thread replies rooted at `threadRootId`
  // instead of top-level messages. Drafts are scoped under a separate key so
  // the main chat composer keeps its own in-flight text, the global "replyingTo"
  // pill is suppressed (the thread drawer shows its own header), and the typing
  // indicator is not broadcast (Slack-parity: thread typing stays in the thread).
  threadRootId?: string | null
  placeholder?: string
}) {
  const isThread = threadRootId !== null
  // Draft scope key — distinct namespace for thread mode so swapping between
  // the main composer and a thread drawer doesn't share text.
  const scopeKey = isThread ? `${convoId}::thread::${threadRootId}` : convoId
  const [draftsByScope, setDraftsByScope] = useState<Record<string, ComposerDraftState>>({})
  const [uploadingByScope, setUploadingByScope] = useState<Record<string, boolean>>({})
  const [uploadErrorsByScope, setUploadErrorsByScope] = useState<Record<string, string>>({})
  const editorRef = useRef<RichInputHandle>(null)
  const uiCommand = useUiCommands((state) => state.command)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (uiCommand?.type === 'focus-composer') {
      const surface = useSurface.getState().surface
      const thread = surface?.kind === 'thread' ? surface : null
      if ((isThread && thread?.rootId === threadRootId) || (!isThread && !thread)) editorRef.current?.focus()
    }
  }, [isThread, threadRootId, uiCommand])
  // Per-scope "have we hydrated the editor DOM yet?" map. Switching scope
  // pulls the saved draft text out of `draftsByScope` and pushes it into the
  // contenteditable; without this guard the editor would re-sync on every
  // keystroke (because draftsByScope changes) and stomp the user's caret.
  const lastSyncedScopeRef = useRef<string>('')
  const draftsRef = useRef(draftsByScope)
  draftsRef.current = draftsByScope

  const currentDraft = draftsByScope[scopeKey] ?? EMPTY_COMPOSER_DRAFT
  const draft = currentDraft.text
  const attachment = currentDraft.attachment
  const uploading = Boolean(uploadingByScope[scopeKey])
  const uploadError = uploadErrorsByScope[scopeKey] ?? null

  const updateComposerDraft = useCallback((
    targetScope: string,
    updater: (current: ComposerDraftState) => ComposerDraftState,
  ) => {
    setDraftsByScope((prev) => {
      const current = prev[targetScope] ?? EMPTY_COMPOSER_DRAFT
      const next = updater(current)
      if (next.text === current.text && next.attachment === current.attachment) return prev
      if (next.text === '' && next.attachment === null) {
        if (!prev[targetScope]) return prev
        const copy = { ...prev }
        delete copy[targetScope]
        return copy
      }
      return { ...prev, [targetScope]: next }
    })
  }, [])

  const setDraft = useCallback((nextText: string | ((prev: string) => string)) => {
    updateComposerDraft(scopeKey, (current) => ({
      ...current,
      text: resolveDraftText(nextText, current.text),
    }))
  }, [scopeKey, updateComposerDraft])

  const setAttachmentForScope = useCallback((targetScope: string, nextAttachment: ApiAttachment | null) => {
    updateComposerDraft(targetScope, (current) => ({
      ...current,
      attachment: nextAttachment,
    }))
  }, [updateComposerDraft])

  const setAttachment = useCallback((nextAttachment: ApiAttachment | null) => {
    setAttachmentForScope(scopeKey, nextAttachment)
  }, [scopeKey, setAttachmentForScope])

  const clearComposerDraft = useCallback(() => {
    updateComposerDraft(scopeKey, () => EMPTY_COMPOSER_DRAFT)
  }, [scopeKey, updateComposerDraft])

  const setUploadingForScope = useCallback((targetScope: string, nextUploading: boolean) => {
    setUploadingByScope((prev) => {
      if (Boolean(prev[targetScope]) === nextUploading) return prev
      const copy = { ...prev }
      if (nextUploading) copy[targetScope] = true
      else delete copy[targetScope]
      return copy
    })
  }, [])

  const setUploadErrorForScope = useCallback((targetScope: string, nextError: string | null) => {
    setUploadErrorsByScope((prev) => {
      if ((prev[targetScope] ?? null) === nextError) return prev
      const copy = { ...prev }
      if (nextError) copy[targetScope] = nextError
      else delete copy[targetScope]
      return copy
    })
  }, [])

  // Reply state — read the quoted message id for THIS convo. The store
  // keeps a per-convo map so flipping rooms preserves each room's draft.
  // In thread mode the quoted id is fixed to threadRootId (every reply in the
  // drawer roots at the thread head); the global per-convo replyingTo is ignored.
  const globalReplyingToId = useConversationUi((s) => s.replyingTo[convoId])
  const setReplyingTo = useConversationUi((s) => s.setReplyingTo)
  const replyingToId = isThread ? threadRootId : globalReplyingToId
  // The "Replying to X" pill inside the composer is for the global compose path.
  // In thread mode the parent drawer renders its own header, so we suppress it here.
  const showReplyingPill = !isThread && Boolean(replyingToId)
  const replyingToMsg = useMessages((s) =>
    replyingToId ? (s.byConvo[convoId] ?? []).find((m) => m.id === replyingToId) : undefined,
  )

  // @-mention state. When the user types `@<query>` immediately before the
  // cursor, we open a picker showing matching members of the current convo.
  const conversation = useConversations((s) => s.list.find((x) => x.id === convoId))
  const byId = useParticipants((s) => s.byId)
  const meId = useMe()
  const memberPool = useMemo<Participant[]>(() => {
    if (!conversation) return []
    return conversation.members
      .map((id) => byId[id])
      .filter((p): p is Participant => Boolean(p) && p.id !== meId)
  }, [conversation, byId, meId])
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  // Picker shows the broadcast token `@all` alongside individual members.
  // Tagged union so insert / keyboard nav can tell them apart without a
  // sentinel id collision (a participant could theoretically be named "all").
  type MentionEntry = { kind: 'all' } | { kind: 'participant'; p: Participant }
  const filteredMentions = useMemo<MentionEntry[]>(() => {
    if (!mention) return []
    const q = mention.query.toLowerCase()
    const out: MentionEntry[] = []
    // `@all` surfaces whenever there's at least one other addressee and the
    // user's query is a prefix of "all" (so "@al" still surfaces it).
    if (memberPool.length > 0 && (q === '' || 'all'.startsWith(q))) {
      out.push({ kind: 'all' })
    }
    for (const p of memberPool) {
      if (p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)) {
        out.push({ kind: 'participant', p })
        if (out.length >= 7) break
      }
    }
    return out
  }, [mention, memberPool])

  // Recompute mention state whenever the draft or selection changes.
  const updateMention = (text: string, caret: number) => {
    // Find the most recent unescaped `@` before the caret with no space after.
    const slice = text.slice(0, caret)
    const at = slice.lastIndexOf('@')
    if (at < 0) { setMention(null); return }
    const before = at === 0 ? '' : text[at - 1]
    // Valid boundary before the new `@`:
    //  - start of string, or
    //  - whitespace, or
    //  - immediately after another mention's `@<id>` token. The browser
    //    inserts a typed `@` between a contenteditable=false chip and
    //    its trailing space (Blink/WebKit quirk), so the new `@` ends
    //    up with a letter to its left — but it's actually a brand-new
    //    mention start. We detect that case by checking whether the
    //    text up to the new `@` ends in `@<id>`.
    const followsMentionChip = /@[A-Za-z][\w-]*$/.test(text.slice(0, at))
    if (before && !/\s/.test(before) && !followsMentionChip) { setMention(null); return }
    const after = slice.slice(at + 1)
    if (/\s/.test(after)) { setMention(null); return }                  // already typed a space
    if (after.length > 30) { setMention(null); return }                 // too long, probably not a mention
    // Only reset the picker's highlighted index when the mention
    // context actually changes (different anchor or different query
    // text). RichInput emits change events on every keyup, including
    // arrow keys used to navigate the picker — without this guard,
    // pressing ArrowDown moves the index then immediately resets it
    // back to 0 on the same key's emitChange, making it look like
    // the picker "snaps back up" on every keystroke.
    if (!mention || mention.start !== at || mention.query !== after) {
      setMention({ start: at, query: after })
      setMentionIndex(0)
    }
  }

  const insertMention = (entry: MentionEntry) => {
    if (!mention) return
    const before = draft.slice(0, mention.start)
    const after = draft.slice(mention.start + 1 + mention.query.length)
    const token = entry.kind === 'all' ? 'all' : entry.p.id
    // Smart separator: if `before` doesn't already end in whitespace,
    // prepend one — happens when the new mention immediately follows
    // a previous mention chip (the browser inserts the typed `@`
    // between the chip and its trailing space, leaving `before` as
    // "@previd"). Without this we'd serialize "@alice@bob  ", which
    // inflates to two chips squashed against each other.
    const sep = before && !/\s$/.test(before) ? ' ' : ''
    const insert = `${sep}@${token} `
    // Collapse any accidental double-trailing-space from sandwiching
    // the new mention next to an existing one.
    const next = `${before}${insert}${after}`.replace(/ {2,}$/, ' ')
    const nextCaret = before.length + insert.length
    setMention(null)
    // setValue reflows the editor's DOM with the new text. Caret lands
    // at the end of the field — accepting this trade-off for the mid-
    // sentence insertion case keeps the composer rewrite small. Most
    // mentions are at the tail of a message anyway.
    editorRef.current?.setValue(next, nextCaret)
    requestAnimationFrame(() => editorRef.current?.focus())
  }

  const upload = async (file: File, targetScope = scopeKey) => {
    setUploadingForScope(targetScope, true)
    setUploadErrorForScope(targetScope, null)
    try {
      const a = await filesApi.uploadFile(file)
      setAttachmentForScope(targetScope, a)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[upload] failed', msg)
      setUploadErrorForScope(targetScope, msg)
      // Auto-clear after a few seconds so the composer doesn't carry
      // stale error chrome into the next message.
      window.setTimeout(() => setUploadErrorForScope(targetScope, null), 4500)
    } finally {
      setUploadingForScope(targetScope, false)
    }
  }

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) await upload(f)
  }

  const onPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile()
        // Paste path: still images-only. Pasting an arbitrary file is
        // unusual outside of clipboard hijack attacks; keep this narrow.
        if (f && f.type.startsWith('image/')) {
          e.preventDefault()
          await upload(f)
          return
        }
      }
    }
  }

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) await upload(f)
  }

  /** Insert raw text at the current caret. Skype shortcodes get a
   *  dedicated path so they materialize as an inline `<img>` rather
   *  than literal text — the visible composer keeps parity with the
   *  rendered message bubble. RichInput emits onChange after the
   *  insert, which re-runs setDraft + the mention detector. */
  const insertAtCursor = (text: string) => {
    const editor = editorRef.current
    if (!editor) return
    const skype = text.startsWith('(') ? findSkypeByShortcode(text) : undefined
    if (skype) editor.insertSkype(skype.key)
    else editor.insertText(text)
  }

  /** Toolbar shortcut for mentions. Preserve the editor selection (the
   * button prevents mousedown blur) and insert an inline separator when the
   * caret follows prose, so contenteditable never needs to create a DIV/BR
   * wrapper to establish a mention boundary. */
  const openMentionByButton = () => {
    const editor = editorRef.current
    if (!editor) return
    const caret = editor.getCaretOffset()
    const value = editor.getValue()
    const previous = caret > 0 ? value[caret - 1] : ''
    editor.insertText(previous && !/\s/.test(previous) ? ' @' : '@')
    requestAnimationFrame(() => editor.focus())
  }

  const [emojiOpen, setEmojiOpen] = useState(false)

  // Drive the typing indicator off the current draft text. Returns a
  // `finalize()` callback so we can flush a `done:true` the instant the
  // user hits send rather than waiting for the 2 s idle timer.
  // Thread typing stays inside the thread (Slack-parity) — pass empty text to
  // keep the emitter inert when in thread mode.
  const finalizeTyping = useTypingEmitter(convoId, isThread ? '' : draft)

  // Slash command picker. Mirrors the @mention picker: opens when the
  // draft is `/` (optionally followed by query chars) at the start of the
  // line, navigated by arrow keys, accepted with Enter/Tab. Currently
  // hosts a single command — `poll` — but the picker is shaped as a list
  // so future commands (`/dm`, `/topic`, …) drop in without restructuring.
  type SlashCommand = {
    id: string
    label: string
    hint: string
    keywords: string[]
    run: () => void
  }
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const [pollComposerOpen, setPollComposerOpen] = useState(false)
  const openPollComposer = useCallback(() => {
    setPollComposerOpen(true)
    setSlashOpen(false)
    clearComposerDraft()
    editorRef.current?.setValue('')
  }, [clearComposerDraft])
  const closePollComposer = useCallback(() => {
    setPollComposerOpen(false)
    requestAnimationFrame(() => editorRef.current?.focus())
  }, [])

  const slashCommands = useMemo<SlashCommand[]>(() => [
    {
      id: 'poll',
      label: 'Poll',
      hint: '发起一次投票，agents 和人都能参与',
      keywords: ['poll', 'vote', '投票', 'p'],
      run: () => openPollComposer(),
    },
  ], [openPollComposer])

  const filteredSlashCommands = useMemo(() => {
    if (!slashOpen) return [] as SlashCommand[]
    const q = slashQuery.toLowerCase()
    if (!q) return slashCommands
    return slashCommands.filter((c) =>
      c.id.startsWith(q) || c.keywords.some((k) => k.toLowerCase().startsWith(q)),
    )
  }, [slashOpen, slashQuery, slashCommands])

  /** Detect whether the current draft+caret state should open / refresh /
   *  close the slash picker. Rule: `/` (then optional [a-zA-Z一-鿿])
   *  must start at column 0 and continue uninterrupted up to the caret.
   *  A space, newline, or any non-word char closes the picker — the user
   *  has clearly moved past command mode. */
  const updateSlash = useCallback((text: string, caret: number) => {
    if (text === '') { setSlashOpen(false); return }
    if (text[0] !== '/') { setSlashOpen(false); return }
    const slice = text.slice(0, caret)
    if (slice.indexOf('\n') !== -1) { setSlashOpen(false); return }
    if (/\s/.test(slice)) { setSlashOpen(false); return }
    const query = slice.slice(1)
    if (!slashOpen || slashQuery !== query) {
      setSlashOpen(true)
      setSlashQuery(query)
      setSlashIndex(0)
    }
  }, [slashOpen, slashQuery])

  const runSlashCommand = useCallback((cmd: SlashCommand) => {
    cmd.run()
    setSlashOpen(false)
    setSlashQuery('')
    setSlashIndex(0)
  }, [])

  const send = () => {
    const v = draft.trim()
    if (v === '/poll' && !isThread) {
      openPollComposer()
      return
    }
    if (!v && !attachment) return
    finalizeTyping()
    sendUserMessage(convoId, v, attachment, replyingToId ?? null)
    clearComposerDraft()
    editorRef.current?.setValue('')
    if (!isThread) setReplyingTo(convoId, null)
    editorRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isImeComposing(e)) return

    // Mention picker keyboard nav takes priority when open
    if (mention && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => (i + 1) % filteredMentions.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((i) => (i - 1 + filteredMentions.length) % filteredMentions.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(filteredMentions[mentionIndex])
        return
      }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return }
    }
    // Slash command picker — same nav contract as the mention picker.
    if (slashOpen && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex((i) => (i + 1) % filteredSlashCommands.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex((i) => (i - 1 + filteredSlashCommands.length) % filteredSlashCommands.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        runSlashCommand(filteredSlashCommands[slashIndex])
        return
      }
      if (e.key === 'Escape') { e.preventDefault(); setSlashOpen(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
    // Escape with an empty draft clears the active reply. Non-empty drafts
    // ignore Escape — losing both the reply target AND text on one keystroke
    // would be the kind of footgun that punishes long messages.
    // In thread mode the root is implicit and uncancellable, so skip this.
    if (!isThread && e.key === 'Escape' && replyingToId && draft.trim() === '') {
      e.preventDefault()
      setReplyingTo(convoId, null)
    }
    // @ keystroke fallback. Typing `@` immediately after a mention chip
    // (or any other contenteditable=false atom) can hit a browser
    // timing quirk where `input` and `selectionchange` both fire with
    // the caret state from BEFORE the `@` was inserted — so
    // updateMention sees the old text and the picker never opens.
    // After the keystroke is committed, force-read the editor and
    // run the detector again. requestAnimationFrame is enough to land
    // after the browser's text insertion has settled.
    if (e.key === '@' && !e.defaultPrevented) {
      requestAnimationFrame(() => {
        const editor = editorRef.current
        if (!editor) return
        updateMention(editor.getValue(), editor.getCaretOffset())
      })
    }
    // Same fallback for `/` — the contenteditable race that bit @-mention
    // detection bites slash detection too. Re-read after the keystroke
    // settles so a `/` typed at position 0 reliably opens the picker.
    if (e.key === '/' && !e.defaultPrevented) {
      requestAnimationFrame(() => {
        const editor = editorRef.current
        if (!editor) return
        updateSlash(editor.getValue(), editor.getCaretOffset())
      })
    }
  }

  // Hitting the reply icon on a bubble should drop the cursor straight into
  // the composer — otherwise the user has to click into the editor before
  // typing, which defeats the point of the affordance.
  useEffect(() => {
    if (!replyingToId) return
    requestAnimationFrame(() => editorRef.current?.focus())
  }, [replyingToId])

  useEffect(() => {
    if (lastSyncedScopeRef.current === scopeKey) return
    lastSyncedScopeRef.current = scopeKey
    setMention(null)
    setEmojiOpen(false)
    // Pull the just-loaded draft text for this scope (read via ref so
    // the effect doesn't re-fire on every keystroke) and hydrate the
    // contenteditable DOM.
    const latest = draftsRef.current[scopeKey]?.text ?? ''
    editorRef.current?.setValue(latest)
    requestAnimationFrame(() => editorRef.current?.focus())
  }, [scopeKey])

  const canSend = (draft.trim().length > 0 || attachment !== null) && !uploading

  return (
    <ComposerSurface className={isThread ? 'border-0 bg-transparent !p-0' : undefined}
      // Composer wrapper is FULLY transparent — the parent <main>'s radial
      // washes (sky from top-left, coral from bottom-right) bleed through
      // uninterrupted, so there's no longer a hard boundary where the
      // thread's background ends and a different composer-bg begins.
      onDragOver={(e) => { e.preventDefault() }}
      onDrop={onDrop}>
      {!isThread && (
        <div className="mx-auto max-w-[900px] px-1 pb-1">
        </div>
      )}
      {pollComposerOpen && !isThread && (
        <PollComposer
          conversationId={convoId}
          onSubmitted={closePollComposer}
          onCancel={closePollComposer}
        />
      )}
      <div className={cn(
        'chat-composer mx-auto min-h-[88px] max-w-[900px] rounded-3xl px-3 pb-3 pt-3 transition',
        // In thread mode the parent drawer footer is already bg-cloud, so use
        // bg-paper inside for visual separation from the surrounding panel.
        isThread ? 'bg-paper' : '',
      )}
      >
        {attachment && (
          <div className="mb-2 inline-flex items-center gap-2.5 py-1.5 px-2 bg-sky2-50 border border-sky2-100 rounded-lg max-w-full">
            {attachment.kind === 'img' ? (
              <img src={attachment.url} alt={attachment.name}
                className="w-10 h-10 object-cover rounded-md" />
            ) : (
              <div className="w-10 h-10 rounded-md grid place-items-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #2A2A35, #1A1A22)' }}>
                <IClip className="w-4 h-4 text-white/85" strokeWidth={1.8} />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-ink-700 truncate max-w-[260px]">{attachment.name}</div>
              <div className="text-[10.5px] text-ink-500 truncate">{attachment.mime ?? attachment.kind}{attachment.size ? ` · ${Math.round(attachment.size / 1024)}KB` : ''}</div>
            </div>
            <button
              onClick={() => setAttachment(null)}
              className="ml-1 w-6 h-6 rounded-md grid place-items-center text-ink-500 hover:bg-cloud hover:text-ink-900 transition shrink-0"
              aria-label="移除附件"
            >×</button>
          </div>
        )}
        {uploading && (
          <div className="mb-2 text-[11.5px] text-ink-500">正在上传…</div>
        )}
        {uploadError && (
          <div className="mb-2 text-[11.5px] py-1 px-2 rounded-md text-coral-deep bg-coral-soft inline-block max-w-full truncate">
            {uploadError}
          </div>
        )}
        {showReplyingPill && (
          <div className="openmaus-reply-preview mb-2 flex min-w-0 items-center gap-2 rounded-lg py-1.5 pl-2.5 pr-1.5">
            <div className="h-4 w-0.5 shrink-0 rounded bg-skype" />
            <div className="min-w-0 flex flex-1 items-center gap-2">
              <div className="shrink-0 text-[10.5px] font-bold uppercase tracking-wider text-skype-deep">
                回复 {byId[replyingToMsg?.authorId ?? '']?.name ?? replyingToMsg?.authorId ?? '…'}
              </div>
              <span className="shrink-0 text-[10px] text-ink-300" aria-hidden>·</span>
              <div
                className="min-w-0 flex-1 truncate text-[12px] text-ink-500"
              >
                {replyingToMsg
                  ? <PreviewText body={replyingToMsg.body.slice(0, 140).replace(/\n/g, ' ')} />
                  : '（正在加载…）'}
              </div>
            </div>
            <button
              onClick={() => setReplyingTo(convoId, null)}
              className="w-6 h-6 rounded-md grid place-items-center text-ink-500 hover:bg-cloud hover:text-ink-900 transition shrink-0 self-center"
              aria-label="取消回复"
              title="取消回复（Esc）"
            >×</button>
          </div>
        )}
        <div className="relative">
          <RichInput
            ref={editorRef}
            defaultValue={draft}
            placeholder={placeholder ?? '输入消息，使用 @ 提及成员，或拖入文件作为附件'}
            ariaLabel="消息输入框"
            className="rich-input whitespace-pre-wrap w-full bg-transparent text-[14px] text-ink-900 leading-[1.5]"
            style={{ minHeight: '1.5em' }}
            maxHeight={200}
            onChange={(value, caret) => {
              setDraft(value)
              updateMention(value, caret)
              updateSlash(value, caret)
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={() => setTimeout(() => setMention(null), 120)}
            resolveMention={(id) => {
              const p = byId[id]
              if (!p) return null
              return {
                name: p.id === meId ? 'you' : p.name,
                initial: p.initial || p.name.charAt(0).toUpperCase(),
                avatarBg: typeof p.avatarBg === 'string' ? p.avatarBg : 'var(--ink-300)',
                kind: p.kind,
                avatarUrl: p.kind === 'agent'
                  ? staticBloubAvatarUrl(p)
                  : typeof p.avatarUrl === 'string' ? p.avatarUrl : undefined,
              }
            }}
          />
          {slashOpen && filteredSlashCommands.length > 0 && (
            <div
              className="app-menu-surface absolute bottom-full left-0 z-20 mb-2 min-w-[280px] p-1 animate-rise"
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-300">
                快捷命令 {slashQuery ? `· "/${slashQuery}"` : ''}
              </div>
              {filteredSlashCommands.map((cmd, i) => {
                const active = i === slashIndex
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    onMouseEnter={() => setSlashIndex(i)}
                    onClick={() => runSlashCommand(cmd)}
                    className={cn(
                      'app-menu-item',
                      active && 'is-active',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex items-center justify-center w-[26px] h-[26px] rounded-full font-mono text-[12px] font-semibold',
                        active ? 'bg-skype-deep text-cloud' : 'bg-sky2-100 text-skype-deep',
                      )}
                    >/</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-ink-900 truncate">{cmd.label}</div>
                      <div className="text-[10.5px] text-ink-500 truncate">{cmd.hint}</div>
                    </div>
                    <span className="text-[10px] text-ink-300 tracking-wide tabular-nums">/{cmd.id}</span>
                  </button>
                )
              })}
            </div>
          )}
          {mention && filteredMentions.length > 0 && (
            <div
              className="app-menu-surface absolute bottom-full left-0 z-20 mb-2 min-w-[240px] p-1 animate-rise"
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-300">
                提及成员 {mention.query ? `· "${mention.query}"` : ''}
              </div>
              {filteredMentions.map((entry, i) => {
                const active = i === mentionIndex
                if (entry.kind === 'all') {
                  return (
                    <button
                      key="__all"
                      type="button"
                      onMouseEnter={() => setMentionIndex(i)}
                      onClick={() => insertMention(entry)}
                      className={cn(
                        'app-menu-item',
                        active && 'is-active',
                      )}
                    >
                      <Avatar
                        p={EVERYONE_BLOUB_PARTICIPANT}
                        size={28}
                        ringColor="transparent"
                        showStatus={false}
                        animated={false}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-semibold text-ink-900 truncate">所有人</div>
                        <div className="text-[10.5px] text-ink-500 truncate">通知会话中的全部成员</div>
                      </div>
                    </button>
                  )
                }
                const p = entry.p
                return (
                  <button
                    key={p.id}
                    type="button"
                    onMouseEnter={() => setMentionIndex(i)}
                    onClick={() => insertMention(entry)}
                    className={cn(
                      'app-menu-item',
                      active && 'is-active',
                    )}
                  >
                    <Avatar p={p} size={26} ringColor="var(--cloud)" showStatus={false} animated={false} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-ink-900 truncate">{p.name}</div>
                      <div className="text-[10.5px] text-ink-500 truncate">@{p.id}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 mt-2 text-ink-300">
          <input
            ref={fileRef}
            type="file"
            // No `accept` — let the user pick anything; the server enforces
            // the mime whitelist. Browser-side accept is only a hint anyway
            // (you can still pick any file via drag-drop), so we lean on
            // the server for the actual policy and surface its error.
            className="hidden"
            onChange={onPickFile}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-7 h-7 rounded-[7px] grid place-items-center hover:bg-sky2-50 hover:text-skype-deep transition"
            title="添加附件"
          ><IClip className="w-[17px] h-[17px]" /></button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={openMentionByButton}
            className="w-7 h-7 rounded-[7px] grid place-items-center hover:bg-sky2-50 hover:text-skype-deep transition"
            title="提及成员"
          ><IAt className="w-[17px] h-[17px]" /></button>
          <div className="relative">
            <button
              onClick={() => setEmojiOpen((v) => !v)}
              className={cn(
                'w-7 h-7 rounded-[7px] grid place-items-center hover:bg-sky2-50 hover:text-skype-deep transition',
                emojiOpen && 'bg-sky2-50 text-skype-deep',
              )}
              title="表情"
            ><ISmile className="w-[17px] h-[17px]" /></button>
            {emojiOpen && (
              <EmojiPopover
                onPick={(e) => { insertAtCursor(e); setEmojiOpen(false) }}
                onClose={() => setEmojiOpen(false)}
              />
            )}
          </div>
          <button
            onClick={send}
            disabled={!canSend}
            className="ml-auto h-[30px] px-3.5 rounded-full font-semibold text-[12px] text-white inline-flex items-center gap-1.5 transition disabled:cursor-not-allowed"
            style={{
              background: canSend ? 'var(--skype)' : 'var(--ink-200)',
              boxShadow: canSend ? '0 4px 12px -3px rgba(0, 168, 240, 0.5)' : 'none',
            }}
          >
            发送 <ISend className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </ComposerSurface>
  )
}

function ThreadLoader() {
  return (
    <div
      className="grid place-items-center py-16"
      style={{ animation: 'lingxiloop-empty-in 280ms ease-out both' }}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-14 h-14 grid place-items-center">
          {/* Ambient halo behind the dots */}
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(0, 168, 240, 0.18), transparent 70%)',
              animation: 'lingxiloop-halo 2.4s ease-in-out infinite',
            }}
          />
          <div className="relative flex items-end gap-[5px] h-3">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-[7px] h-[7px] rounded-full"
                style={{
                  background: 'var(--skype)',
                  boxShadow: '0 1px 4px rgba(0, 168, 240, 0.45)',
                  animation: 'lingxiloop-pulse-dot 1.2s ease-in-out infinite',
                  animationDelay: `${i * 160}ms`,
                }}
              />
            ))}
          </div>
        </div>
        <div className="font-display italic text-[13px] text-ink-500 tracking-tight">
          正在加载消息…
        </div>
      </div>
    </div>
  )
}

function ThreadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const [retrying, setRetrying] = useState(false)
  const handleRetry = async () => {
    if (retrying) return
    setRetrying(true)
    try { await onRetry() } finally { setRetrying(false) }
  }
  return (
    <div
      className="grid place-items-center py-12 px-6"
      style={{ animation: 'lingxiloop-empty-in 280ms ease-out both' }}
    >
      <div
        className="flex flex-col items-center text-center max-w-[340px] gap-3 rounded-2xl px-6 py-6 backdrop-blur-sm"
        style={{
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 217, 210, 0.18))',
          border: '1px solid rgba(255, 122, 107, 0.18)',
          boxShadow: '0 12px 32px -16px rgba(200, 78, 63, 0.25)',
        }}
      >
        <div
          className="w-10 h-10 rounded-full grid place-items-center"
          style={{
            background: 'rgba(255, 122, 107, 0.12)',
            color: 'var(--coral-deep)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-[18px] h-[18px]" aria-hidden>
            <path d="M12 8.5v4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="16.2" r="1" fill="currentColor" />
            <path
              d="M10.6 3.6a1.6 1.6 0 0 1 2.8 0l8.1 14.4a1.6 1.6 0 0 1-1.4 2.4H3.9a1.6 1.6 0 0 1-1.4-2.4l8.1-14.4Z"
              stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="font-display font-medium text-[15px] tracking-tight text-ink-700">
          无法加载消息
        </div>
        <div className="text-[12.5px] text-ink-500 leading-relaxed break-words">
          {message}
        </div>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="mt-1 h-[30px] px-3.5 rounded-full font-semibold text-[12px] text-white inline-flex items-center gap-1.5 transition disabled:cursor-not-allowed"
          style={{
            background: retrying ? 'var(--ink-300)' : 'var(--skype)',
            boxShadow: retrying ? 'none' : '0 4px 12px -3px rgba(0, 168, 240, 0.5)',
          }}
        >
          {retrying ? (
            <>
              <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              正在重试…
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" aria-hidden>
                <path
                  d="M4 12a8 8 0 0 1 13.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16M4 20v-4h4"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
              重试
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function _EmptyConversationState() {
  // Live counts pulled straight from the store so the empty stage carries
  // one tiny piece of "alive" data at the bottom — matches the inline
  // italic counter pattern in WhispersView's sidebar header.
  const list = useConversations((s) => s.list)
  const total = list.length
  const unread = useMemo(
    () => list.reduce((n, c) => n + (c.muted ? 0 : (c.unread ?? 0)), 0),
    [list],
  )

  // Click "pop" reaction: cloud bounces + tilts when you tap it. The
  // animation runs once via a CSS keyframe; we toggle the boolean back
  // off after the keyframe duration so the next click can re-trigger.
  // Ignoring re-clicks while popping is intentional — a rapid click
  // mid-animation looks like jitter, not playfulness.
  const [popping, setPopping] = useState(false)
  const onCloudPoke = () => {
    if (popping) return
    setPopping(true)
    window.setTimeout(() => setPopping(false), 760)
    // Treat a poke as a little surprise — blink once shortly after.
    triggerBlink()
  }

  // Periodic blink: every 4-7 s the cloud closes its eyes briefly.
  // The closed-eye frame is /cloud-blink.png — same cloud, generated by
  // gpt-image-2's /images/edits with a mask covering only the eye
  // regions. Animation is driven by the `lingxiloop-eye-blink` keyframe
  // (asymmetric close-fast / open-slow timing) — see globals.css. The
  // hold duration here must match the keyframe duration so the React
  // state clears at the same moment the animation ends.
  const BLINK_MS = 220
  const [blinking, setBlinking] = useState(false)
  const blinkResetRef = useRef<number | null>(null)
  const triggerBlink = () => {
    setBlinking(true)
    if (blinkResetRef.current !== null) window.clearTimeout(blinkResetRef.current)
    blinkResetRef.current = window.setTimeout(() => {
      setBlinking(false)
      blinkResetRef.current = null
    }, BLINK_MS)
  }
  useEffect(() => {
    // Schedule the next blink at a randomized 4-7 s interval. After it
    // fires, the timeout reschedules itself recursively, which lets us
    // re-randomize on each tick instead of running on a fixed cadence
    // (fixed cadence looks robotic — real eye blinks are irregular).
    let cancelled = false
    let timer: number | null = null
    const schedule = () => {
      const delay = 4000 + Math.random() * 3000
      timer = window.setTimeout(() => {
        if (cancelled) return
        triggerBlink()
        // Occasionally do a double-blink for extra personality. Gap is
        // tuned to start the second blink JUST after the first one ends
        // (220ms keyframe + ~70ms beat) so it reads as "blink-blink"
        // rather than two unrelated blinks.
        if (Math.random() < 0.18) {
          window.setTimeout(() => { if (!cancelled) triggerBlink() }, 290)
        }
        schedule()
      }, delay)
    }
    schedule()
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
      if (blinkResetRef.current !== null) window.clearTimeout(blinkResetRef.current)
    }
  }, [])


  return (
    <ConversationView
      className="relative overflow-hidden"
      style={{
        // Sky pocket centered on the cloud — the previous linear
        // top→bottom gradient put pale sky-blue along the WHOLE top
        // edge, which collided visually with the white conversations
        // sidebar to its left and read as a hard seam. A radial
        // gradient concentrated where the cloud actually sits keeps
        // the sky atmosphere around the mascot but fades to paper at
        // every pane edge, so the boundary with the sidebar is paper
        // meeting white instead of sky-blue meeting white.
        background:
          'radial-gradient(ellipse 60% 55% at 50% 40%,' +
          ' var(--sky-100) 0%,' +
          ' var(--sky-50) 45%,' +
          ' var(--paper) 100%)',
      }}
    >
      {/* Scroll container — the previous version centered with `grid
          place-items-center` directly on <main>, which clipped the title
          on shorter windows because excess content overflowed equally
          top + bottom. This pattern (`min-h-full` + `place-items: center`
          inside an overflow-y-auto wrapper) keeps content centered when
          it fits and falls back to scroll-from-top when it doesn't. */}
      <div className="absolute inset-0 overflow-y-auto">
        <div className="relative min-h-full grid place-items-center px-6 py-12">
          <div
            className="flex flex-col items-center text-center max-w-md"
            style={{ animation: 'lingxiloop-empty-in 480ms cubic-bezier(0.2, 0.8, 0.2, 1) both' }}
          >
            {/* Hero — LingxiLoop's mascot cloud. The PNG was rendered offline
                with gpt-image-2 against a magenta backdrop and chroma-
                keyed to a transparent silhouette (see
                /tmp/gen-lingxiloop-cloud.py for the prompt + extraction
                pipeline). Against the now-flat cloud-white background
                the cloud lives unadorned — no halo, no aura, no tinted
                wash. The kawaii face + plush shading is enough on its
                own; anything extra reads as fussy decoration. */}
            <div className="relative mb-9" style={{ width: 300, height: 220 }} aria-hidden>
              {/* The cloud — a slow ambient bob restores the light,
                  breezy mascot feel without turning the empty screen
                  into a loader. Sized to the PNG's ~1.36:1 aspect ratio
                  (the fluffier cloud is taller than the original
                  wide-cumulus take).
                  Two-layer transform: the OUTER div carries the ambient
                  placement; the INNER button carries hover-scale and
                  click-pop. Splitting the concerns keeps interaction
                  transforms independent from layout. */}
              <div
                className="absolute lingxiloop-cloud-float"
                style={{
                  left: 30, top: 16,
                  width: 240, height: 176,
                }}
              >
                <button
                  type="button"
                  onClick={onCloudPoke}
                  aria-label="Hello cloud"
                  className="lingxiloop-cloud-poke group block w-full h-full cursor-pointer p-0 border-0 bg-transparent focus:outline-none"
                  style={{
                    // Silky-spring transition. The hover-state CSS rule
                    // sets target scale(1.03); this transition tweens
                    // BOTH directions (mouseenter AND mouseleave) with
                    // the same easing — important so the return feels
                    // as elegant as the entry. cubic-bezier (0.34, 1.5,
                    // 0.4, 1) is a soft spring: 0.5× overshoot ramp,
                    // settling cleanly. Long 540ms so the gentle
                    // overshoot is felt as Q-bounce rather than tween.
                    transition: popping
                      ? undefined
                      : 'transform 540ms cubic-bezier(0.34, 1.5, 0.4, 1)',
                    transformOrigin: 'center 65%',
                    willChange: popping ? 'transform' : undefined,
                    // Click pop — same gentler curve as hover-return so
                    // the whole motion vocabulary feels consistent.
                    animation: popping
                      ? 'lingxiloop-cloud-pop 760ms cubic-bezier(0.34, 1.5, 0.4, 1) both'
                      : undefined,
                  }}
                >
                  {/* Single-base + eye-only overlay. Previously we
                      crossfaded between two FULL PNG frames; even
                      though they look identical outside the eyes,
                      gpt-image-2 re-encodes the whole image during a
                      masked edit and produces sub-pixel shifts across
                      the body, so the crossfade made the whole cloud
                      "shimmer" on every blink. Fix: cloud.png is the
                      permanent base, always at opacity 1. cloud-blink
                      .png sits on top but its CSS mask reveals ONLY
                      a small ellipse over the eye band, so the body
                      pixels are guaranteed to come from a single
                      source even during a blink. */}
                  <div className="relative w-full h-full">
                    <img
                      src="/cloud.png"
                      alt=""
                      width={240}
                      height={176}
                      draggable={false}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        filter:
                          'drop-shadow(0 18px 28px rgba(94, 168, 215, 0.18))' +
                          'drop-shadow(0 6px 12px rgba(94, 168, 215, 0.10))',
                      }}
                    />
                    <img
                      src="/cloud-blink.png"
                      alt=""
                      width={240}
                      height={176}
                      draggable={false}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        // Driven by a keyframe (lingxiloop-eye-blink) rather
                        // than a symmetric opacity transition. The
                        // keyframe enforces asymmetric close-fast /
                        // open-slow timing — see globals.css. When the
                        // animation prop becomes `undefined` between
                        // blinks the element snaps back to opacity 0
                        // (its rest style), which is exactly what we
                        // want for the next trigger to start clean.
                        opacity: 0,
                        animation: blinking
                          ? 'lingxiloop-eye-blink 220ms ease-in-out both'
                          : undefined,
                        willChange: blinking ? 'opacity' : undefined,
                        // Mask reveals only the eye band — radial
                        // ellipse centered on the eye row. Position +
                        // size are tuned to the deployed cloud.png:
                        // run scipy connected-components on it (see
                        // gen-lingxiloop-blink.py for the detection
                        // recipe) to find eye centroids, then express
                        // (cx, cy, half-width, half-height) as % of
                        // the image dimensions.
                        //   batch1+v14 eyes (current): eyes at cx 50%,
                        //   cy 52%, ~48×46 px each in 512×339 → mask
                        //   45%×20% at (50%, 52%). Previously was
                        //   40%×16% at (50%, 67%) for the v10-family
                        //   clouds whose faces sat lower in frame.
                        WebkitMaskImage:
                          'radial-gradient(ellipse 45% 20% at 50% 52%, #000 0%, #000 35%, transparent 92%)',
                        maskImage:
                          'radial-gradient(ellipse 45% 20% at 50% 52%, #000 0%, #000 35%, transparent 92%)',
                        // No drop-shadow on this layer — the base
                        // cloud already casts the shadow; doubling it
                        // would show during a blink as a dark rim.
                      }}
                    />
                  </div>
                </button>
              </div>

              {/* Gold ★ — perched on the cloud's upper-right shoulder
                  like a tiny ornament. Asymmetric placement reads CUTE
                  rather than POSED. */}
              <span
                className="absolute font-display select-none leading-none"
                style={{
                  top: 6, right: 42,
                  fontSize: 18,
                  color: 'var(--gold)',
                  textShadow:
                    '0 0 14px rgba(244, 183, 64, 0.72),' +
                    '0 2px 4px rgba(186, 132, 24, 0.38)',
                }}
              >★</span>

              {/* One barely-there ✦ drifting on the opposite side, to
                  balance the star without crowding the scene. */}
              <span
                className="absolute font-display select-none leading-none"
                style={{
                  bottom: 18, left: 38,
                  fontSize: 11,
                  color: 'var(--gold)',
                  opacity: 0.55,
                  textShadow: '0 0 6px rgba(244, 183, 64, 0.50)',
                }}
              >✦</span>
            </div>

            <h2
              className="font-display font-medium text-[28px] text-ink-900 leading-[1.12]"
              style={{ letterSpacing: '-0.025em' }}
            >
              Pick up where you left off
            </h2>
            <p className="mt-2.5 font-display italic text-[14px] text-ink-500 leading-relaxed max-w-[360px]">
              Choose a thread on the left to slip back in.
            </p>

            {total > 0 && (
              <div className="mt-6 text-[12px] text-ink-400 font-display italic flex items-center gap-1.5">
                <span className="text-gold leading-none not-italic" style={{ fontSize: 10 }}>★</span>
                <b className="not-italic text-ink-700 font-semibold tabular-nums">{total}</b>
                <span>{total === 1 ? 'thread waiting' : 'threads waiting'}</span>
                {unread > 0 && (
                  <>
                    <span className="text-ink-200" aria-hidden>·</span>
                    <b className="not-italic text-coral-deep font-semibold tabular-nums">{unread}</b>
                    <span>unread</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ConversationView>
  )
}

function OpenMausEmptyConversationState() {
  const total = useConversations((s) => s.list.filter((c) => c.kind !== 'whisper').length)
  return (
    <main className="chat-surface omb-titlebar-safe omb-drag grid h-full min-w-0 place-items-center">
      <div className="omb-no-drag flex max-w-sm flex-col items-center gap-3 px-8 text-center">
        <img src="/logo.png" alt="" className="size-14 rounded-2xl opacity-90" draggable={false} />
        <h1 className="text-[17px] font-semibold text-ink">选择一个会话开始交流</h1>
        <p className="text-[13px] leading-6 text-ink-secondary">
          {total > 0 ? `左侧共有 ${total} 个会话。你也可以搜索消息，或新建群聊。` : '新消息和 Agent 的实时进度会显示在这里。'}
        </p>
      </div>
    </main>
  )
}

function ConversationActivity({ conversationId }: { conversationId: string }) {
  const [events, setEvents] = useState<ApiCoworkerActivity[]>([])
  useEffect(() => {
    if (isMockImDevelopment()) {
      setEvents([])
      return
    }
    let cancelled = false
    setEvents([])
    const merge = (rows: ApiCoworkerActivity[]) => {
      if (cancelled) return
      setEvents((current) => {
        const byId = new Map(current.map((event) => [event.id, event]))
        for (const event of rows) byId.set(event.id, event)
        return [...byId.values()]
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .slice(-12)
      })
    }
    const refresh = () => void agentsApi.getCoworkerActivity(conversationId)
      .then(merge)
      .catch(() => { /* activity is best-effort; chat remains primary */ })
    refresh()
    void ws.connect()
    const off = ws.on((event) => {
      if (event.type === 'agent.activity' && event.conversationIds.includes(conversationId)) {
        merge([event.activity])
      } else if (event.type === 'hello') {
        // Reconcile anything missed while the socket was disconnected.
        refresh()
      }
    })
    // Slow REST reconciliation is only a fallback for dropped/backpressured WS
    // frames; live activity arrives through the same realtime path as messages.
    const timer = window.setInterval(refresh, 60_000)
    return () => { cancelled = true; off(); window.clearInterval(timer) }
  }, [conversationId])
  const visible = events.slice(-3)
  if (visible.length === 0) return null
  // A run emits multiple activity rows. Only its newest row represents the
  // current state; otherwise an older run.started row can outlive a later
  // run.completed row and leave the strip pulsing forever.
  const latestByRun = new Map<string, ApiCoworkerActivity>()
  for (const event of events) latestByRun.set(event.runId, event)
  const active = [...latestByRun.values()].reverse()
    .find((event) => event.runStatus === 'running' || event.runStatus === 'waiting_for_human')
  return (
    <div className="border-b border-hairline bg-panel px-5 py-2" role="status" aria-label="Agent 最近活动">
      <div className="mx-auto flex max-w-[900px] items-center gap-3 overflow-hidden">
        <span className={`size-2 shrink-0 rounded-full ${active ? 'animate-pulse bg-[var(--working)]' : 'bg-[var(--avail)]'}`} />
        <span className="shrink-0 text-[11px] font-semibold text-ink-secondary">
          {active ? `${active.agentName}${active.runStatus === 'waiting_for_human' ? ' 正在等待你' : ' 正在工作'}` : '最近活动'}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {visible.map((event) => (
            <span key={event.id} className="max-w-[240px] truncate rounded-full bg-raised px-2.5 py-1 text-[10.5px] text-ink-500" title={event.title}>
              {/completed/.test(event.kind) ? '✓' : /failed/.test(event.kind) ? '!' : '●'} {event.title}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ChatPane({ onOpenGroupContext }: { onOpenGroupContext?: () => void } = {}) {
  const convoId = useApp((s) => s.selectedConversationId)
  const uiCommand = useUiCommands((state) => state.command)
  // Atomic selectors — primitive / stable refs
  const byConvo = useMessages((s) => (convoId ? s.byConvo[convoId] : undefined))
  const streaming = useMessages((s) => s.streaming)
  const typingIds = useMessages((s) => (convoId ? s.typing[convoId] ?? null : null))
  const isLoading = useMessages((s) => (convoId ? s.loading.has(convoId) : false))
  // ThreadLoader visibility — the textbook loader-flicker pattern, with
  // BOTH guards in place:
  //   show-delay (400 ms): nothing renders until the load has been in
  //     flight that long. Cached convos / 404s / fast network loads all
  //     finish before this fires, so the loader stays hidden entirely.
  //   min-visible (500 ms): once the loader DOES appear, it must stay
  //     visible at least that long. Without this, a load that crosses
  //     the 400 ms threshold and finishes 80 ms later would flash the
  //     loader for 80 ms — exactly the "appears then immediately
  //     disappears" UX the user reported.
  //   Net: loads < 400 ms never show the loader; loads 400-900 ms show
  //   it for 500-900 ms (smooth, no flicker); loads > 900 ms show it
  //   for the full duration.
  const [showLoader, setShowLoader] = useState(false)
  const loaderTimers = useRef<{ show: number | null; hide: number | null; shownAt: number | null }>({
    show: null, hide: null, shownAt: null,
  })
  useEffect(() => {
    const t = loaderTimers.current
    if (t.show !== null) { window.clearTimeout(t.show); t.show = null }
    if (t.hide !== null) { window.clearTimeout(t.hide); t.hide = null }

    if (isLoading) {
      if (t.shownAt !== null) return  // already visible
      t.show = window.setTimeout(() => {
        setShowLoader(true)
        t.shownAt = Date.now()
        t.show = null
      }, 400)
      return
    }
    // Loading ended.
    if (t.shownAt === null) {
      setShowLoader(false)
      return
    }
    const elapsed = Date.now() - t.shownAt
    const remaining = Math.max(0, 500 - elapsed)
    if (remaining === 0) {
      setShowLoader(false)
      t.shownAt = null
      return
    }
    t.hide = window.setTimeout(() => {
      setShowLoader(false)
      t.shownAt = null
      t.hide = null
    }, remaining)
  }, [isLoading, convoId])
  useEffect(() => () => {
    const t = loaderTimers.current
    if (t.show !== null) window.clearTimeout(t.show)
    if (t.hide !== null) window.clearTimeout(t.hide)
  }, [])
  const loadError = useMessages((s) => (convoId ? s.errors[convoId] ?? null : null))
  const retryLoad = useMessages((s) => s.retryLoad)
  // Compose with memo so the rendered array ref stays stable when inputs do
  const list = useMemo(
    () => messagesFor({ byConvo: byConvo ? { [convoId!]: byConvo } : {}, streaming, typing: convoId ? { [convoId]: typingIds } : {} } as MessagesState, convoId),
    [byConvo, streaming, typingIds, convoId],
  )
  const adjacency = useMemo(() => projectTranscriptAdjacency(list), [list])
  const conversations = useConversations((s) => s.list)
  const c = useMemo(() => conversations.find((x) => x.id === convoId), [conversations, convoId])
  const byId = useParticipants((s) => s.byId)
  const streamRef = useRef<HTMLDivElement>(null)
  const virtuosoRef = useRef<VirtuosoHandle | null>(null)
  // Whether the scroll is currently anchored to the latest message — drives
  // the bottom-right "scroll to latest" pill that appears once the user
  // scrolls up. Default true so the pill stays hidden on first mount.
  const [atBottom, setAtBottom] = useState(true)
  const scrollToLatest = useCallback(() => {
    if (list.length === 0) return
    virtuosoRef.current?.scrollToIndex({ index: list.length - 1, align: 'end', behavior: 'smooth' })
  }, [list.length])

  // Older-history pager — virtualization keeps the DOM small; this fetches
  // the next page upward when the user scrolls past the top.
  const hasMoreOlder = useMessages((s) => (convoId ? s.hasMoreOlder[convoId] ?? false : false))
  const loadingOlder = useMessages((s) => (convoId ? s.loadingOlder.has(convoId) : false))
  const loadOlder = useMessages((s) => s.loadOlder)
  // Anchor for upward pagination — the store decrements this per prepend so
  // Virtuoso holds scroll position when older history pages in.
  const firstItemIndex = useMessages((s) => (convoId ? s.firstItemIndex[convoId] ?? VIRTUOSO_FIRST_INDEX_BASE : VIRTUOSO_FIRST_INDEX_BASE))
  const onStartReached = useCallback(() => {
    if (!convoId) return
    if (!hasMoreOlder || loadingOlder) return
    void loadOlder(convoId)
  }, [convoId, hasMoreOlder, loadingOlder, loadOlder])

  // In-conversation search — opened by the chat-header search icon.
  // We don't filter the thread; we highlight matching rows in place and
  // jump between them with the up/down arrows or Enter / Shift+Enter.
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [matchIdx, setMatchIdx] = useState(0)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const findMatches = useMemo(() => projectFindMatches(list, deferredSearchQuery), [list, deferredSearchQuery])
  const currentMatch = findMatches[matchIdx] ?? null
  const matchedIds = useMemo(() => new Set(findMatches.map((match) => match.messageId)), [findMatches])
  // Reset the search when the user navigates to a different conversation.
  useEffect(() => {
    setSearchOpen(false); setSearchQuery(''); setMatchIdx(0)
  }, [convoId])
  // Reset to the first hit whenever the result set changes.
  useEffect(() => { setMatchIdx(0) }, [deferredSearchQuery, findMatches.length])
  // Scroll the current hit into view. We virtualize the message list so a
  // matched row may not even be mounted yet — virtuoso's scrollToIndex
  // mounts and centers it in one go.
  useEffect(() => {
    const id = currentMatch?.messageId
    if (!id) return
    const index = list.findIndex((m) => m.id === id)
    if (index < 0) return
    virtuosoRef.current?.scrollToIndex({ index, align: 'center', behavior: 'smooth' })
  }, [currentMatch?.messageId, currentMatch?.occurrence, list])

  useEffect(() => {
    if (!searchOpen) { clearFindHighlights(); return }
    const frame = window.requestAnimationFrame(() => {
      applyFindHighlights(streamRef.current, deferredSearchQuery, currentMatch)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [searchOpen, deferredSearchQuery, currentMatch, list])

  const refreshFindHighlights = useCallback(() => {
    if (!searchOpen) return
    window.requestAnimationFrame(() => applyFindHighlights(streamRef.current, deferredSearchQuery, currentMatch))
  }, [searchOpen, deferredSearchQuery, currentMatch])

  useEffect(() => () => clearFindHighlights(), [])

  useEffect(() => {
    if (uiCommand?.type === 'find-chat') setSearchOpen(true)
  }, [uiCommand])

  // Centralized "jump to message" — quote clicks and `#N` chips both set
  // useApp.pendingJumpMessageId and we resolve it here. virtuoso.scrollToIndex
  // mounts off-screen rows reliably; previously a quote click that lost its
  // DOM element (Virtuoso recycled it) silently did nothing. Once the target
  // is mounted we briefly flash it like the old quote jump did.
  const pendingJumpId = useConversationUi((s) => s.pendingJumpMessageId)
  const clearPendingJump = useConversationUi((s) => s.clearPendingJump)
  useEffect(() => {
    if (!pendingJumpId) return
    const index = list.findIndex((m) => m.id === pendingJumpId)
    if (index >= 0) {
      virtuosoRef.current?.scrollToIndex({ index, align: 'center', behavior: 'smooth' })
      // Wait for Virtuoso to mount the row (smooth scroll + recycle ≈ 0–500ms),
      // then flash it. Poll briefly because mount timing varies.
      const targetId = pendingJumpId
      const deadline = Date.now() + 800
      const tryFlash = (): void => {
        const el = document.getElementById(`m-${targetId}`)
        if (el) {
          el.classList.add('quote-jump-flash')
          window.setTimeout(() => el.classList.remove('quote-jump-flash'), 1400)
        } else if (Date.now() < deadline) {
          window.setTimeout(tryFlash, 60)
        }
      }
      window.setTimeout(tryFlash, 80)
    }
    // Clear after we've handled it so a repeat click on the same id re-fires.
    clearPendingJump()
  }, [pendingJumpId, list, clearPendingJump])
  // Auto-focus the search input when the bar opens.
  useEffect(() => {
    if (searchOpen) {
      // requestAnimationFrame: wait for the input to mount.
      const h = window.requestAnimationFrame(() => searchInputRef.current?.focus())
      return () => window.cancelAnimationFrame(h)
    }
  }, [searchOpen])

  // Track which message IDs were already present when this conversation
  // first opened — those get the "initial wave" stagger. Anything that lands
  // after that is brand-new and animates immediately (delay 0), so the thread
  // doesn't blink with empty space while the new row waits its turn.
  const initialIdsRef = useRef<Set<string> | null>(null)
  // Messages that have already played their rise-in fade this convo session.
  // Virtuoso unmounts/remounts rows as you scroll or jump to a quote, and a
  // remount replays the fade — that's the "the quoted message reloads / fades
  // back in after the flash" bug. Animate each message at most once per open.
  const animatedIdsRef = useRef<Set<string>>(new Set())
  const lastConvoRef = useRef<string | null>(null)
  // Sticky "first scroll for this convo hasn't happened yet" flag. The effect
  // below can't compare lastConvoRef to convoId because we sync the ref here
  // at render time — by the time the effect runs they're already equal. The
  // flag stays true until messages actually land and we do the instant snap.
  const pendingConvoSwitchRef = useRef(true)
  if (lastConvoRef.current !== convoId) {
    lastConvoRef.current = convoId
    initialIdsRef.current = new Set(list.map((m) => m.id))
    pendingConvoSwitchRef.current = true
    animatedIdsRef.current = new Set()
  } else if (initialIdsRef.current === null) {
    initialIdsRef.current = new Set(list.map((m) => m.id))
  }

  useEffect(() => {
    // Virtuoso's `followOutput` keeps appended messages glued to the bottom;
    // we only need to do an explicit jump when the user switches into a
    // conversation that already had messages loaded (initialTopMostItemIndex
    // only fires on first mount, not on convo switches within the same
    // mounted instance).
    if (list.length === 0) return
    const isConvoSwitch = pendingConvoSwitchRef.current
    pendingConvoSwitchRef.current = false
    if (isConvoSwitch) {
      virtuosoRef.current?.scrollToIndex({ index: list.length - 1, align: 'end', behavior: 'auto' })
    }
  }, [list.length, convoId])

  // IMPORTANT: every hook in this component must run on EVERY render —
  // React enforces a stable hook order. The "no conversation selected"
  // branch lives below the hooks, not in their middle. (Previously this
  // useMemo sat after an early return, so leaving a group / clearing
  // the selection dropped the hook count between renders and crashed
  // the tree with "Rendered fewer hooks than expected".)
  // Render the empty state until the selected conversation belongs to the
  // current list. During a company switch the old convoId can survive for
  // a render while the new tenant's conversations are loading; requiring
  // `c` here keeps the composer from flashing before the cloud appears.
  if (!convoId || !c) {
    return <OpenMausEmptyConversationState />
  }

  return (
    <main
      className="chat-surface grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden"
    >
      <ConversationHeader
        conversationId={convoId}
        onOpenDetails={() => {
          const participantId = c.members.find((id) => byId[id]?.kind === 'agent')
          if (participantId) useSurface.getState().openAgentInfo(participantId)
        }}
        actions={(
          <>
            {c.kind === 'group' && onOpenGroupContext && <button
              type="button"
              onClick={onOpenGroupContext}
              title="打开知识库和 Canvas"
              aria-label="打开群聊上下文"
              className="grid size-9 place-items-center rounded-full text-ink-secondary transition hover:bg-raised hover:text-ink"
            >
              <ICanvas className="size-[18px]" />
            </button>}
            <button
              type="button"
              onClick={() => setSearchOpen((value) => !value)}
              title="搜索当前会话"
              aria-label="搜索当前会话"
              className={cn('grid size-9 place-items-center rounded-full transition', searchOpen ? 'bg-raised text-accent' : 'text-ink-secondary hover:bg-raised hover:text-ink')}
            >
              <ISearch className="size-[18px]" />
            </button>
          </>
        )}
      />
      {/* Keep optional chrome in one stable grid cell. ConversationActivity
          returns null when there are no events; rendering it as a top-level
          grid child used to shift the message list into an auto row and the
          composer into the flexible row, collapsing the chat. */}
      <div data-chat-auxiliary="true">
        <ConversationActivity conversationId={convoId} />
        {searchOpen && (
          <div className="flex items-center gap-2 border-b border-hairline bg-panel px-5 py-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg bg-raised/70 px-3 py-1.5 text-[13px] text-ink-secondary focus-within:ring-1 focus-within:ring-accent">
            <ISearch className="w-3.5 h-3.5" strokeWidth={2} />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); return }
                const n = findMatches.length
                if (n === 0) return
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setMatchIdx((i) => (i + 1) % n); return }
                if ((e.key === 'Enter' && e.shiftKey) || e.key === 'ArrowUp') { e.preventDefault(); setMatchIdx((i) => (i - 1 + n) % n); return }
                if (e.key === 'ArrowDown') { e.preventDefault(); setMatchIdx((i) => (i + 1) % n) }
              }}
              placeholder="搜索当前会话…"
              className="flex-1 min-w-0 bg-transparent outline-none text-ink-900 placeholder:text-ink-300"
            />
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-300">
              {findMatches.length === 0
                ? (searchQuery.trim() ? '无匹配' : '')
                : `${matchIdx + 1} / ${findMatches.length}`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMatchIdx((i) => (i - 1 + findMatches.length) % Math.max(1, findMatches.length))}
            disabled={findMatches.length === 0}
            title="上一个匹配项（Shift+Enter / ↑）"
            className="w-8 h-8 rounded-[8px] grid place-items-center text-ink-500 hover:bg-sky2-50 hover:text-skype-deep transition disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-500"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setMatchIdx((i) => (i + 1) % Math.max(1, findMatches.length))}
            disabled={findMatches.length === 0}
            title="下一个匹配项（Enter / ↓）"
            className="w-8 h-8 rounded-[8px] grid place-items-center text-ink-500 hover:bg-sky2-50 hover:text-skype-deep transition disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-500"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => { setSearchOpen(false); setSearchQuery('') }}
            title="关闭（Esc）"
            className="w-8 h-8 rounded-[8px] grid place-items-center text-ink-500 hover:bg-sky2-50 transition"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-4 h-4">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
          </div>
        )}
      </div>
      <div ref={streamRef} className="min-h-0 relative">
        {/* Empty-state branches: an error from the initial fetch wins over the
            loader (a stale spinner under an error message would be confusing).
            Both only render when the thread itself is empty — once any messages
            have landed we let the regular list take over so a transient WS
            reconnect blip doesn't yank the conversation out from under the
            user. */}
        {list.length === 0 && loadError ? (
          <div className="px-6 py-6">
            <ThreadError message={loadError} onRetry={() => retryLoad(convoId)} />
          </div>
        ) : list.length === 0 && showLoader ? (
          <div className="px-6 py-6">
            <ThreadLoader />
          </div>
        ) : (
          <MessageList
            virtuosoRef={virtuosoRef}
            messages={list}
            firstItemIndex={firstItemIndex}
            startReached={onStartReached}
            atBottomStateChange={setAtBottom}
            rangeChanged={refreshFindHighlights}
            // Initial-height hint so Virtuoso's first-pass sizing is
            // close to the real per-message height (avatar + 1-2 lines
            // of text). Without it the list starts assuming a tiny
            // default and every ResizeObserver tick pushes content
            // around, which compounds with image / OG-card lazy loads
            // into the scroll jitter users see.
            defaultItemHeight={96}
            increaseViewportBy={{ top: 800, bottom: 800 }}
            components={{
              Header: () => (
                <div className="mx-auto flex w-full max-w-[900px] flex-col gap-2 px-5 pt-6">
                  {hasMoreOlder ? (
                    <div className="self-center py-1 px-2.5 rounded-full text-[10.5px] font-medium text-ink-400">
                      {loadingOlder ? '正在加载更早的消息…' : ' '}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-ink-300 text-[11px] font-bold tracking-[0.08em] uppercase">
                      <span className="flex-1 h-px bg-gradient-to-r from-transparent via-ink-100 to-transparent" />
                      会话开始
                      <span className="flex-1 h-px bg-gradient-to-r from-transparent via-ink-100 to-transparent" />
                    </div>
                  )}
                </div>
              ),
              Footer: () => <div className="h-3" />,
            }}
            itemContent={(i, m) => {
              const rowIndex = i >= firstItemIndex ? i - firstItemIndex : i
              const author = byId[m.authorId]
              // System / whisper rows render without a resolved author (e.g. the
              // calendar-fired notice has a synthetic system author id). Only
              // gate real authored messages on the participant being loaded.
              if (!author && m.kind !== 'system' && m.kind !== 'whisper-link') return <div className="h-0" />
              const wasInitial = initialIdsRef.current?.has(m.id) ?? false
              const delay = wasInitial ? Math.min(i * 30, 200) : 0
              // Animate a message's rise-in at most once per convo session, so a
              // Virtuoso remount (scroll / quote-jump) doesn't replay the fade.
              const firstAnimation = !animatedIdsRef.current.has(m.id)
              if (firstAnimation) animatedIdsRef.current.add(m.id)
              const rowAdjacency = adjacency[rowIndex]
              const isMatch = searchOpen && matchedIds.has(m.id)
              const isCurrent = isMatch && currentMatch?.messageId === m.id
              return (
                <div
                  data-msg-id={m.id}
                  data-find-message-id={m.id}
                  className={cn(
                    'mx-auto w-full max-w-[900px] rounded-[10px] px-5 transition-shadow',
                    rowAdjacency?.isContinuedFromPrevious ? 'pt-[2px]' : 'pt-[9px]',
                    rowAdjacency?.isContinuedToNext ? 'pb-[2px]' : 'pb-[9px]',
                    isMatch && 'find-row-fallback',
                    isCurrent && 'find-row-current-fallback',
                  )}
                >
                  <MessageRow msg={m} author={author} adjacency={rowAdjacency} delay={delay} animate={firstAnimation} openMaus />
                </div>
              )
            }}
          />
        )}
        {/* Bottom-right "scroll to latest" pill — appears once the user has
            scrolled up off the bottom. Fades in (animate-rise), tucks against
            the composer's top edge so it doesn't fight the typing area. */}
        <ScrollToLatestButton visible={!atBottom} onClick={scrollToLatest} zh />
      </div>
      <Composer convoId={convoId} />
    </main>
  )
}
