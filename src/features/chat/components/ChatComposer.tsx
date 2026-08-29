import { uploadsApi } from '@/features/platform/api'
import type { ApiAttachment } from '@/api/contracts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IAt, IClip, ISend, ISmile } from '@/components/icons'
import { PollComposer } from '@/components/PollComposer'
import { PreviewText } from '@/components/PreviewText'
import type { RichInputHandle } from '@/components/RichInput'
import { ComposerSurface } from '@/im/Composer'
import { staticBloubAvatarUrl } from '@/lib/bloub/staticAvatar'
import { isImeComposing } from '@/lib/keyboard'
import { findSkypeByShortcode } from '@/lib/skypeEmojis'
import { cn } from '@/lib/utils'
import { getActiveCompanyId, useMe } from '@/stores/auth'
import { useConversations } from '@/features/conversations/store'
import { useConversationUi } from '@/stores/conversationUi'
import { useMessages } from '../state/messages'
import { useParticipants } from '@/features/agents/state'
import { useSurface } from '@/stores/surface'
import { useUiCommand } from '@/stores/uiCommands'
import type { Participant } from '@/types'
import { readComposerDraftTexts, saveComposerDraftText } from '../drafts'
import { ComposerAttachment } from './ComposerAttachment'
import { ComposerEditor } from './ComposerEditor'
import { ComposerEmojiPopover } from './ComposerEmojiPopover'
import type { ComposerCommand, MentionEntry } from './ComposerMenus'
import { sendComposerMessage } from '../sendComposerMessage'
import { useTypingEmitter } from '../useTypingEmitter'

type ComposerDraftState = {
  text: string
  attachment: ApiAttachment | null
}

const EMPTY_COMPOSER_DRAFT: ComposerDraftState = { text: '', attachment: null }

function resolveDraftText(next: string | ((prev: string) => string), prev: string) {
  return typeof next === 'function' ? next(prev) : next
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
  const meId = useMe()
  const companyId = getActiveCompanyId()
  const [draftsByScope, setDraftsByScope] = useState<Record<string, ComposerDraftState>>(() =>
    Object.fromEntries(Object.entries(readComposerDraftTexts(companyId, meId)).map(([scope, text]) => [
      scope,
      { text, attachment: null },
    ])),
  )
  const [uploadingByScope, setUploadingByScope] = useState<Record<string, boolean>>({})
  const [uploadErrorsByScope, setUploadErrorsByScope] = useState<Record<string, string>>({})
  const editorRef = useRef<RichInputHandle>(null)
  const uiCommand = useUiCommand()
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

  useEffect(() => {
    saveComposerDraftText(companyId, meId, scopeKey, draft)
  }, [companyId, draft, meId, scopeKey])

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
      const a = await uploadsApi.uploadFile(file)
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

  const slashCommands = useMemo<ComposerCommand[]>(() => [
    {
      id: 'poll',
      label: 'Poll',
      hint: '发起一次投票，agents 和人都能参与',
      keywords: ['poll', 'vote', '投票', 'p'],
      run: () => openPollComposer(),
    },
  ], [openPollComposer])

  const filteredSlashCommands = useMemo(() => {
    if (!slashOpen) return [] as ComposerCommand[]
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

  const runSlashCommand = useCallback((cmd: ComposerCommand) => {
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
    if (!meId) {
      void sendComposerMessage({ conversationId: convoId, text: v, attachment, replyingToId: replyingToId ?? null })
      return
    }
    void sendComposerMessage({ conversationId: convoId, text: v, attachment, replyingToId: replyingToId ?? null })
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
        <ComposerAttachment
          attachment={attachment}
          uploading={uploading}
          error={uploadError}
          onRemove={() => setAttachment(null)}
        />
        {showReplyingPill && (
          <div className="openmaus-reply-preview mb-2 flex min-w-0 items-center gap-2 rounded-xl py-1.5 ps-2.5 pe-1.5">
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
              className="grid size-10 shrink-0 place-items-center self-center rounded-md text-ink-500 transition hover:bg-cloud hover:text-ink-900"
              aria-label="取消回复"
              title="取消回复（Esc）"
            >×</button>
          </div>
        )}
        <ComposerEditor
          editorRef={editorRef}
          draft={draft}
          placeholder={placeholder ?? '输入消息，使用 @ 提及成员，或拖入文件作为附件'}
          onChange={(value, caret) => {
            setDraft(value)
            updateMention(value, caret)
            updateSlash(value, caret)
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => setTimeout(() => setMention(null), 120)}
          resolveMention={(id) => {
            const participant = byId[id]
            if (!participant) return null
            return {
              name: participant.id === meId ? 'you' : participant.name,
              initial: participant.initial || participant.name.charAt(0).toUpperCase(),
              avatarBg: typeof participant.avatarBg === 'string' ? participant.avatarBg : 'var(--ink-300)',
              kind: participant.kind,
              avatarUrl: participant.kind === 'agent'
                ? staticBloubAvatarUrl(participant)
                : typeof participant.avatarUrl === 'string' ? participant.avatarUrl : undefined,
            }
          }}
          mention={mention}
          mentionEntries={filteredMentions}
          mentionIndex={mentionIndex}
          onMentionHover={setMentionIndex}
          onMentionPick={insertMention}
          commandOpen={slashOpen}
          commandQuery={slashQuery}
          commands={filteredSlashCommands}
          commandIndex={slashIndex}
          onCommandHover={setSlashIndex}
          onCommandPick={runSlashCommand}
        />
        <div className="mt-2 flex items-center gap-1 text-ink-300">
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
            className="grid size-10 place-items-center rounded-[9px] transition hover:bg-sky2-50 hover:text-skype-deep"
            title="添加附件"
          ><IClip className="w-[17px] h-[17px]" /></button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={openMentionByButton}
            className="grid size-10 place-items-center rounded-[9px] transition hover:bg-sky2-50 hover:text-skype-deep"
            title="提及成员"
          ><IAt className="w-[17px] h-[17px]" /></button>
          <div className="relative">
            <button
              onClick={() => setEmojiOpen((v) => !v)}
              className={cn(
                'grid size-10 place-items-center rounded-[9px] transition hover:bg-sky2-50 hover:text-skype-deep',
                emojiOpen && 'bg-sky2-50 text-skype-deep',
              )}
              title="表情"
            ><ISmile className="w-[17px] h-[17px]" /></button>
            {emojiOpen && (
              <ComposerEmojiPopover
                onPick={(e) => { insertAtCursor(e); setEmojiOpen(false) }}
                onClose={() => setEmojiOpen(false)}
              />
            )}
          </div>
          <button
            onClick={send}
            disabled={!canSend}
            className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold text-white transition disabled:cursor-not-allowed"
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
