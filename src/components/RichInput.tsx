/**
 * Lightweight rich-text composer input — a contenteditable div that mixes
 * plain text with inline Skype emoticon images. Exposes an imperative
 * handle so the parent can read/write the current value, insert text or
 * Skype emojis at the caret, query caret position, and focus the field.
 *
 * The DOM is the source of truth. Every input/change re-serializes the
 * div's content to a plain-text string where Skype `<img>` nodes become
 * `(name)` shortcodes — matching how messages are stored and parsed
 * elsewhere in the app. This keeps the wire format identical to the
 * pre-contenteditable composer.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react'
import { findSkypeByKey, findSkypeByShortcode, SKYPE_SHORTCODE_RE, skypeEmojiUrl } from '@/lib/skypeEmojis'

export interface MentionInfo {
  /** Display name shown after the `@` inside the chip. */
  name: string
  /** Single-character fallback for the avatar circle when no image. */
  initial: string
  /** CSS background value for the avatar circle (e.g. linear-gradient). */
  avatarBg: string
  /** `human` / `agent` — drives chip colour. */
  kind: 'human' | 'agent'
  /** Optional avatar image URL. When provided, replaces the initial. */
  avatarUrl?: string
}

export interface RichInputHandle {
  focus(): void
  /** Read the current serialized value. */
  getValue(): string
  /** Replace the entire content. Used when switching conversations or
   *  clearing after send. */
  setValue(s: string): void
  /** Insert plain text at the current caret position. Returns the new
   *  serialized value + caret offset. */
  insertText(s: string): void
  /** Insert a Skype emoticon as a real inline `<img>` at the caret. */
  insertSkype(key: string): void
  /** Caret position expressed as offset into the serialized string. */
  getCaretOffset(): number
}

interface Props {
  defaultValue?: string
  placeholder?: string
  className?: string
  style?: CSSProperties
  maxHeight?: number
  onChange?: (value: string, caretOffset: number) => void
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
  onPaste?: (e: ClipboardEvent<HTMLDivElement>) => void
  onBlur?: () => void
  onFocus?: () => void
  ariaLabel?: string
  /** Soft-keyboard hints for iOS / Android. Pass `enterKeyHint="send"`
   *  to surface the Send return key on mobile composers; the desktop
   *  composer can omit it. `autoCapitalize` / `autoCorrect` are
   *  honored by iOS Safari + Android WebView on contenteditable. */
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send'
  autoCapitalize?: 'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters'
  autoCorrect?: 'on' | 'off'
  /** Optional resolver — when given, inflated `@<id>` tokens that
   *  resolve to a real participant get rendered as inline mention
   *  chips (avatar + name pill, contenteditable=false). Unresolved
   *  mentions stay as plain `@<id>` text so typos aren't fake-
   *  validated. */
  resolveMention?: (id: string) => MentionInfo | null
}

const SKYPE_IMG_SIZE = 20

/** Build the DOM `<span>` node we use for an inline Skype emoticon.
 *  `data-skype-emoji` is the marker that serialize/walks pick up to
 *  map the node back to its shortcode. `contenteditable="false"`
 *  makes the browser treat the chip as an atom — caret jumps over
 *  it, Backspace deletes the whole span.
 *
 *  Style assignment is done property-by-property instead of
 *  `Object.assign(span.style, ...)`: the DOM CSSStyleDeclaration
 *  doesn't auto-append `px` to numeric values (unlike React's
 *  style prop) and doesn't accept CSS custom properties via plain
 *  assignment — they need `setProperty('--name', ...)`. Skipping
 *  this nuance made the chip render at 0×0 with the animation
 *  vars missing, so the inserted emoji silently disappeared. */
function makeSkypeNode(key: string): HTMLSpanElement {
  const meta = findSkypeByKey(key)
  const frames = meta?.frames ?? 1
  const size = SKYPE_IMG_SIZE
  const durationMs = Math.max(400, frames * 50)
  const span = document.createElement('span')
  span.className = 'skype-emoji-anim'
  span.dataset.skypeEmoji = key
  span.dataset.skypeFrames = String(frames)
  span.title = meta?.label ?? key
  span.contentEditable = 'false'
  span.setAttribute('role', 'img')
  span.setAttribute('aria-label', meta?.shortcodes[0] ?? `(${key})`)
  span.style.width = `${size}px`
  span.style.height = `${size}px`
  // URL flows through a var to the `.skype-emoji-anim::before` strip (see
  // globals.css) — the strip animates via transform so steps() survives the
  // composited chat-page layer.
  span.style.setProperty('--skype-url', `url(${skypeEmojiUrl(key)})`)
  span.style.marginBottom = '1px'
  span.style.setProperty('--skype-cycle-frames', String(frames))
  span.style.setProperty('--skype-cycle-y', `-${size * frames}px`)
  span.style.setProperty('--skype-cycle-dur', `${durationMs}ms`)
  return span
}

/** Build the DOM `<span>` chip for an @mention. Mirrors the message-
 *  card's MentionChip visually — small avatar circle + @name pill,
 *  colour-coded by participant kind. `contenteditable="false"` makes
 *  the chip atomic (caret skips it, Backspace deletes the whole span).
 *  The marker for serialization is `data-mention-id`. */
function makeMentionNode(id: string, info: MentionInfo): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.dataset.mentionId = id
  chip.contentEditable = 'false'
  chip.title = id === 'all' ? '@all' : `@${info.name}`
  chip.style.display = 'inline-flex'
  chip.style.alignItems = 'center'
  chip.style.gap = '4px'
  chip.style.padding = '0 7px'
  chip.style.borderRadius = '999px'
  chip.style.fontWeight = '600'
  chip.style.verticalAlign = '-0.15em' // centers the chip on 14px CJK text; keep in sync with Message.tsx MentionChip
  chip.style.lineHeight = '1.4'
  chip.style.userSelect = 'none'
  if (id === 'all' || info.kind === 'human') {
    chip.style.background = 'var(--coral-soft)'
    chip.style.color = 'var(--coral-deep)'
  } else {
    chip.style.background = 'var(--sky-50)'
    chip.style.color = 'var(--skype-deep)'
  }

  const avatar = document.createElement('span')
  avatar.style.display = 'inline-grid'
  avatar.style.placeItems = 'center'
  avatar.style.width = '16px'
  avatar.style.height = '16px'
  avatar.style.borderRadius = '50%'
  avatar.style.fontSize = '9px'
  avatar.style.fontWeight = '700'
  avatar.style.color = 'white'
  avatar.style.lineHeight = '1'
  avatar.style.overflow = 'hidden'
  avatar.style.flexShrink = '0'
  if (id === 'all') {
    const img = document.createElement('img')
    img.src = '/everyone.png'
    img.alt = ''
    img.style.width = '100%'
    img.style.height = '100%'
    img.style.borderRadius = '50%'
    img.style.objectFit = 'cover'
    avatar.appendChild(img)
  } else if (info.avatarUrl) {
    const img = document.createElement('img')
    img.src = info.avatarUrl
    img.alt = ''
    img.style.width = '100%'
    img.style.height = '100%'
    img.style.borderRadius = '50%'
    img.style.objectFit = 'cover'
    avatar.appendChild(img)
  } else {
    avatar.style.background = info.avatarBg || 'var(--ink-300)'
    avatar.textContent = info.initial.charAt(0)
  }

  const label = document.createElement('span')
  label.textContent = `@${id === 'all' ? 'all' : info.name}`
  label.style.lineHeight = '1'

  chip.appendChild(avatar)
  chip.appendChild(label)
  return chip
}

/** Serialize a contenteditable subtree to the plain-text string we
 *  send / store. Text nodes pass through verbatim; `<br>` and block
 *  closes become `\n`; Skype `<img>` nodes become their shortcode. */
function serializeNode(root: Node): string {
  let out = ''
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    if (el.tagName === 'BR') { out += '\n'; return }
    // Skype emoji chips — serialize back to their canonical shortcode.
    // Accept either <span> (current) or <img> (legacy drafts that
    // pre-date the sprite migration). The marker is the
    // `data-skype-emoji` attribute, not the tag name.
    const skypeKey = el.dataset.skypeEmoji
    if (skypeKey) {
      const meta = findSkypeByKey(skypeKey)
      out += meta?.shortcodes[0] ?? `(${skypeKey})`
      return
    }
    // Mention chips — `data-mention-id` marker → `@id` text. We DON'T
    // recurse into the chip's children (the visible name label) since
    // that would double up the @ prefix.
    const mentionId = el.dataset.mentionId
    if (mentionId) {
      out += `@${mentionId}`
      return
    }
    if (el.tagName === 'IMG') {
      // Other images that snuck in (e.g. pasted) — drop silently. The
      // composer surfaces image *attachments* via a separate channel.
      return
    }
    // Browser quirk: typing Enter wraps the new line in a <div>. Treat
    // each block container as a logical newline boundary.
    const isBlockBreak = el.tagName === 'DIV' || el.tagName === 'P'
    if (isBlockBreak && out && !out.endsWith('\n')) out += '\n'
    for (const c of Array.from(el.childNodes)) visit(c)
  }
  for (const c of Array.from(root.childNodes)) visit(c)
  return out
}

/** Compute the caret position in the serialized string, given a DOM
 *  selection's anchor (container + offset). */
function caretOffsetIn(root: Node, container: Node, offset: number): number {
  let result = 0
  let done = false
  const visit = (node: Node) => {
    if (done) return
    if (node === container) {
      if (container.nodeType === Node.TEXT_NODE) {
        result += offset
      } else {
        // Element container — `offset` counts child nodes BEFORE caret.
        for (let i = 0; i < offset && i < node.childNodes.length; i++) {
          visit(node.childNodes[i])
          if (done) return
        }
      }
      done = true
      return
    }
    if (node.nodeType === Node.TEXT_NODE) {
      result += (node.nodeValue ?? '').length
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    if (el.tagName === 'BR') { result += 1; return }
    const skypeKey = el.dataset.skypeEmoji
    if (skypeKey) {
      const meta = findSkypeByKey(skypeKey)
      result += (meta?.shortcodes[0] ?? `(${skypeKey})`).length
      return
    }
    const mentionId = el.dataset.mentionId
    if (mentionId) { result += 1 + mentionId.length; return }
    if (el.tagName === 'IMG') return
    const isBlockBreak = el.tagName === 'DIV' || el.tagName === 'P'
    if (isBlockBreak && result && !endsWithNewline(result)) result += 1
    for (const c of Array.from(el.childNodes)) {
      visit(c)
      if (done) return
    }
  }
  visit(root)
  return result
}

// We can't peek at the partial output to check trailing newline without
// duplicating state; the caret walker just keeps a running counter, so
// guard with a no-op stub that always says "no" — block elements add at
// most one extra \n per element which matches what serializeNode does
// most of the time. (A doubly-empty <div> would over-count by one
// character, an acceptable error for a caret reading used to drive
// the mention picker.)
function endsWithNewline(_: number): boolean { return false }

/** Inflate a serialized string back into DOM nodes, materializing
 *  every `(name)` Skype shortcode and every resolvable `@<id>` mention
 *  as an inline chip. We do a combined scan with a single regex so the
 *  two patterns can't overlap. Unresolved mentions (resolver returns
 *  null or no resolver provided) pass through as plain `@id` text. */
const COMBINED_TOKEN_RE = (() => {
  // `@<id>` boundary policy: the `@` must sit at the start of the
  // string, after a non-word char, OR right after a previous
  // `@<id>` chip — the latter so that "@alice@bob" parses as two
  // back-to-back mentions (Blink/WebKit can insert a typed `@`
  // directly after a contenteditable=false chip, with no
  // whitespace separator). Lookbehind is variable-length;
  // supported in Chrome/Edge/Electron and Safari 16.4+.
  const mention = String.raw`(?<=^|[^A-Za-z0-9_]|@[A-Za-z][\w-]{0,30})@([A-Za-z][\w-]*)`
  const skype = SKYPE_SHORTCODE_RE.source
  return new RegExp(`${mention}|${skype}`, 'gi')
})()

function inflate(value: string, target: HTMLElement, resolveMention?: (id: string) => MentionInfo | null) {
  while (target.firstChild) target.removeChild(target.firstChild)
  if (!value) return
  const re = new RegExp(COMBINED_TOKEN_RE.source, 'gi')
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(value)) !== null) {
    const mentionId = m[1]
    if (mentionId) {
      // The boundary char (whitespace etc.) before the `@` is part of
      // the match — keep it as plain text so the chip sits in context.
      const atIdx = m[0].lastIndexOf('@')
      const lead = m[0].slice(0, atIdx)
      const info = mentionId === 'all'
        ? { name: 'all', initial: 'A', avatarBg: 'var(--coral-soft)', kind: 'human' as const }
        : (resolveMention?.(mentionId) ?? null)
      if (info) {
        if (m.index + atIdx > last) appendText(target, value.slice(last, m.index) + lead)
        else if (lead) appendText(target, lead)
        target.appendChild(makeMentionNode(mentionId, info))
        last = m.index + m[0].length
        continue
      }
      // Unresolved — treat the whole match as plain text and keep
      // walking. Don't advance past the leading boundary char so a
      // subsequent shortcode like "...(rofl)" still matches.
      continue
    }
    // Skype shortcode branch
    const sc = m[0]
    const meta = findSkypeByShortcode(sc)
    if (meta) {
      if (m.index > last) appendText(target, value.slice(last, m.index))
      target.appendChild(makeSkypeNode(meta.key))
      last = m.index + sc.length
    }
  }
  if (last < value.length) appendText(target, value.slice(last))
}

/** Append text, converting `\n` to `<br>` so the layout matches what a
 *  textarea would have rendered. */
function appendText(target: HTMLElement, text: string) {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) target.appendChild(document.createTextNode(lines[i]))
    if (i < lines.length - 1) target.appendChild(document.createElement('br'))
  }
}

/** Move the caret to the end of `el`. Used after `setValue` so the user
 *  resumes typing at the tail. */
function moveCaretToEnd(el: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  if (!sel) return
  sel.removeAllRanges()
  sel.addRange(range)
}

export const RichInput = forwardRef<RichInputHandle, Props>(function RichInput(
  {
    defaultValue, placeholder, className, style, maxHeight,
    onChange, onKeyDown, onPaste, onBlur, onFocus,
    ariaLabel,
    enterKeyHint, autoCapitalize, autoCorrect,
    resolveMention,
  },
  ref,
) {
  const elRef = useRef<HTMLDivElement>(null)
  // Cache of the last value we *emitted* — so external `setValue` calls
  // are easy to distinguish from user edits and we don't double-emit.
  const lastEmittedRef = useRef<string>('')

  const emitChange = useCallback(() => {
    const el = elRef.current
    if (!el) return
    const value = serializeNode(el)
    let caret = value.length
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0)
      if (el.contains(r.startContainer)) {
        caret = caretOffsetIn(el, r.startContainer, r.startOffset)
      }
    }
    lastEmittedRef.current = value
    onChange?.(value, caret)
  }, [onChange])

  // Resolver may change as the participants store loads — keep a
  // ref so setValue / paste / inflate calls always see the latest
  // version without having to re-run useImperativeHandle.
  const resolveMentionRef = useRef(resolveMention)
  resolveMentionRef.current = resolveMention

  // Initial population. Runs once on mount with `defaultValue`.
  useLayoutEffect(() => {
    const el = elRef.current
    if (!el) return
    inflate(defaultValue ?? '', el, resolveMentionRef.current)
    lastEmittedRef.current = defaultValue ?? ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-resize: cap height with maxHeight + scroll.
  useEffect(() => {
    if (!maxHeight) return
    const el = elRef.current
    if (!el) return
    el.style.maxHeight = `${maxHeight}px`
    el.style.overflowY = 'auto'
  }, [maxHeight])

  // Selection-change fallback. Typing right next to a
  // contenteditable=false chip (a Skype emoji or @mention) doesn't
  // always trigger a clean `input` event in WebKit/Blink — the browser
  // mutates the DOM but the React handler can land before the caret
  // settles, so `updateMention` upstream never re-runs and the @
  // picker fails to open. A `selectionchange` listener fires on every
  // caret move while the editor has focus, guaranteeing we re-emit
  // the current value + caret after any movement the OS knows about.
  useEffect(() => {
    const handler = () => {
      const el = elRef.current
      if (!el) return
      const active = document.activeElement
      if (active !== el && !el.contains(active)) return
      emitChange()
    }
    document.addEventListener('selectionchange', handler)
    return () => document.removeEventListener('selectionchange', handler)
  }, [emitChange])

  useImperativeHandle(ref, () => ({
    focus() { elRef.current?.focus() },
    getValue() {
      const el = elRef.current
      return el ? serializeNode(el) : ''
    },
    setValue(s: string) {
      const el = elRef.current
      if (!el) return
      inflate(s, el, resolveMentionRef.current)
      lastEmittedRef.current = s
      moveCaretToEnd(el)
      onChange?.(s, s.length)
    },
    insertText(s: string) {
      const el = elRef.current
      if (!el) return
      el.focus()
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
        el.appendChild(document.createTextNode(s))
        moveCaretToEnd(el)
        emitChange()
        return
      }
      const range = sel.getRangeAt(0)
      range.deleteContents()
      // Insert as text node so the surrounding selection updates cleanly.
      const node = document.createTextNode(s)
      range.insertNode(node)
      // Move caret to the end of the inserted text.
      range.setStartAfter(node)
      range.setEndAfter(node)
      sel.removeAllRanges()
      sel.addRange(range)
      emitChange()
    },
    insertSkype(key: string) {
      const el = elRef.current
      if (!el) return
      el.focus()
      const sel = window.getSelection()
      const chip = makeSkypeNode(key)
      // Always pair the inline-block atom with a trailing zero-width
      // text node. Two reasons:
      //   1. iOS WKWebView occasionally inserts an implicit <br> after
      //      a freshly-injected inline-block, kicking the next caret
      //      position to a new line. Owning the trailing whitespace
      //      forces a known DOM shape.
      //   2. Caret needs a text node to live in cleanly; landing it on
      //      an Element offset (after a contenteditable=false atom)
      //      causes flaky cursor rendering on iOS.
      const tail = document.createTextNode('​')
      if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
        el.appendChild(chip)
        el.appendChild(tail)
      } else {
        const range = sel.getRangeAt(0)
        range.deleteContents()
        range.insertNode(chip)
        // Insert tail immediately after the chip in the same parent.
        chip.parentNode?.insertBefore(tail, chip.nextSibling)
      }
      const range = document.createRange()
      range.setStart(tail, 1)
      range.setEnd(tail, 1)
      sel?.removeAllRanges()
      sel?.addRange(range)
      emitChange()
    },
    getCaretOffset() {
      const el = elRef.current
      if (!el) return 0
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return 0
      const r = sel.getRangeAt(0)
      return caretOffsetIn(el, r.startContainer, r.startOffset)
    },
  }), [emitChange, onChange])

  /** Backspace adjacent to a contenteditable=false atom (mention chip /
   *  Skype emoji) requires TWO key presses in iOS WKWebView — the first
   *  to "select" the atom, the second to delete. Pre-empt that here:
   *  when the caret is right after such an atom, delete the whole atom
   *  in one go. Mirrors the desktop expectation and matches how Slack /
   *  iMessage behave.
   *
   *  IMPORTANT: the iOS soft keyboard's backspace fires `beforeinput`
   *  with `inputType="deleteContentBackward"` but does NOT reliably
   *  dispatch a `keydown` event with `key="Backspace"` — that's a
   *  long-standing WKWebView quirk. We therefore drive the same core
   *  logic from BOTH event paths: keydown handles Bluetooth / desktop
   *  hardware keyboards, beforeinput handles the iOS soft keyboard.
   *  This function takes a callback for preventing the default action
   *  so each handler can call the right `preventDefault` on its event
   *  type. */
  const tryAtomicBackspace = (preventDefault: () => void): boolean => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false
    const range = sel.getRangeAt(0)
    const el = elRef.current
    if (!el || !el.contains(range.startContainer)) return false
    // Walk backward from the caret, skipping over any pure-whitespace
    // text content (regular spaces, NBSP, ZWSP, BOM). When we hit the
    // first non-whitespace thing, if it's a contenteditable=false atom,
    // delete the atom AND every whitespace node we skipped, in one go.
    //
    // Without this aggregation, iOS WKWebView mangles the second press:
    // after the first backspace eats a trailing space, the caret gets
    // stranded at the start of the editor and the mention picker
    // spuriously re-opens. Aggregating into one press sidesteps the
    // buggy intermediate state.
    const WS_RE = /^[\s\u200B\uFEFF]*$/
    let prev: Node | null
    let prefixToTrim: { node: Text; keep: string } | null = null
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      const tn = range.startContainer as Text
      const before = (tn.textContent ?? '').slice(0, range.startOffset)
      if (!WS_RE.test(before)) return false  // real text before caret — let default backspace eat one char
      const allWs = WS_RE.test(tn.textContent ?? '')
      prefixToTrim = allWs
        ? { node: tn, keep: '' }
        : { node: tn, keep: (tn.textContent ?? '').slice(range.startOffset) }
      prev = tn.previousSibling
    } else {
      prev = range.startOffset > 0
        ? range.startContainer.childNodes[range.startOffset - 1] ?? null
        : null
    }
    const whitespaceNodes: Text[] = []
    while (prev && prev.nodeType === Node.TEXT_NODE && WS_RE.test(prev.textContent ?? '')) {
      whitespaceNodes.push(prev as Text)
      prev = prev.previousSibling
    }
    if (!prev || prev.nodeType !== Node.ELEMENT_NODE) return false
    if ((prev as HTMLElement).contentEditable !== 'false') return false
    preventDefault()
    let next: Node | null = prev.nextSibling
    while (next && next.nodeType === Node.TEXT_NODE && WS_RE.test(next.textContent ?? '')) {
      const toRemove = next
      next = next.nextSibling
      toRemove.parentNode?.removeChild(toRemove)
    }
    for (const w of whitespaceNodes) w.parentNode?.removeChild(w)
    if (prefixToTrim) {
      if (prefixToTrim.keep === '') prefixToTrim.node.parentNode?.removeChild(prefixToTrim.node)
      else prefixToTrim.node.textContent = prefixToTrim.keep
    }
    const parent = prev.parentNode
    prev.parentNode?.removeChild(prev)
    // Anchor the caret cleanly where the atom used to sit. Letting iOS
    // guess is what produced the "cursor jumps to start of editor and
    // re-opens the mention picker" bug.
    if (parent) {
      const anchor = document.createTextNode('')
      parent.insertBefore(anchor, next ?? null)
      const r = document.createRange()
      r.setStart(anchor, 0)
      r.setEnd(anchor, 0)
      sel.removeAllRanges()
      sel.addRange(r)
    }
    emitChange()
    return true
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Backspace' && tryAtomicBackspace(() => e.preventDefault())) return
    onKeyDown?.(e)
  }

  // iOS soft keyboard backspace doesn't surface as keydown(key="Backspace")
  // — it shows up here as inputType="deleteContentBackward". Wire the same
  // atomic-delete logic to this event so the mobile composer actually
  // removes mention chips / emoji in one tap.
  //
  // Stash the latest tryAtomicBackspace into a ref so the once-only
  // beforeinput listener always calls the fresh closure (it sees the
  // up-to-date emitChange / onChange via that chain).
  const tryAtomicBackspaceRef = useRef(tryAtomicBackspace)
  tryAtomicBackspaceRef.current = tryAtomicBackspace
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const handler = (e: Event) => {
      const ie = e as InputEvent
      if (ie.inputType !== 'deleteContentBackward') return
      tryAtomicBackspaceRef.current(() => ie.preventDefault())
    }
    el.addEventListener('beforeinput', handler)
    return () => el.removeEventListener('beforeinput', handler)
  }, [])

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    // Forward to caller first — they may handle image paste themselves.
    onPaste?.(e)
    if (e.defaultPrevented) return
    // Default behaviour: strip formatting, drop only plain text in. The
    // browser's native paste would otherwise carry over fonts, sizes,
    // and even foreign images that confuse serialization.
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (!text) return
    e.preventDefault()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    range.deleteContents()
    // Re-use the inflate path so shortcodes pasted in become real imgs.
    const wrapper = document.createElement('span')
    inflate(text, wrapper, resolveMentionRef.current)
    const frag = document.createDocumentFragment()
    while (wrapper.firstChild) frag.appendChild(wrapper.firstChild)
    const lastNode = frag.lastChild
    range.insertNode(frag)
    if (lastNode) {
      range.setStartAfter(lastNode)
      range.setEndAfter(lastNode)
      sel.removeAllRanges()
      sel.addRange(range)
    }
    emitChange()
  }

  return (
    <div
      ref={elRef}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline="true"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      // Soft-keyboard hints — only honored by mobile WebViews; desktop
      // browsers ignore the unknown attributes silently.
      enterKeyHint={enterKeyHint}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      data-placeholder={placeholder ?? ''}
      className={className}
      style={style}
      onInput={emitChange}
      onKeyDown={handleKeyDown}
      onKeyUp={emitChange}
      onMouseUp={emitChange}
      onPaste={handlePaste}
      onBlur={onBlur}
      onFocus={onFocus}
    />
  )
})
