/**
 * TipTap mention extension wired to Cumora's participant store.
 *
 * Suggestion strategy:
 *  - Trigger character `@` opens a popup of matching participants.
 *  - The popup is rendered through a portal so it isn't clipped by
 *    the editor's overflow container or the sticky toolbar.
 *  - Positioning is anchored to TipTap's `clientRect` (the caret), so
 *    it follows scroll + repositions on input.
 *
 * The committed node is `mention` with attrs `{ id, label }`. It
 * travels through the Yjs XmlFragment alongside the rest of the inline
 * content, so collaborators see the same canonical ids — which is
 * what lets the server-side notifier resolve participants without
 * fuzzy text matching.
 */
import { createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { SuggestionOptions } from '@tiptap/suggestion'
import Mention from '@tiptap/extension-mention'
import type { Participant } from '@/types'
import { useParticipants } from '@/stores/participants'
import { MentionList, filterMentionCandidates, type MentionListHandle } from '@/components/MentionList'

/** Floating popup pinned near the caret's `clientRect`. We can't use
 *  editor-relative positioning since the popup needs to escape the
 *  editor's overflow-clipped container. */
class MentionPopup {
  private el: HTMLDivElement
  private root: Root
  /** Imperative handle on the rendered MentionList — lets us forward
   *  keyboard events from TipTap's suggestion plugin. */
  readonly ref = createRef<MentionListHandle>()

  constructor() {
    this.el = document.createElement('div')
    this.el.style.position = 'fixed'
    this.el.style.zIndex = '60'
    this.el.style.pointerEvents = 'auto'
    this.el.style.display = 'none'
    document.body.appendChild(this.el)
    this.root = createRoot(this.el)
  }

  setRect(rect: DOMRect | null) {
    if (!rect) {
      this.el.style.display = 'none'
      return
    }
    this.el.style.display = ''
    // Prefer below the caret; flip above if it would overflow. 280px
    // matches MentionList's max-height.
    const popupHeight = 280
    const below = rect.bottom + 6
    const wouldOverflowBelow = below + popupHeight > window.innerHeight
    this.el.style.top = wouldOverflowBelow
      ? `${Math.max(8, rect.top - popupHeight - 6)}px`
      : `${below}px`
    // Clamp horizontally so the popup never escapes the right edge.
    const popupWidth = 260
    const left = Math.min(rect.left, window.innerWidth - popupWidth - 8)
    this.el.style.left = `${Math.max(8, left)}px`
  }

  render(items: Participant[], command: (payload: { id: string; label: string }) => void) {
    this.root.render(
      <MentionList ref={this.ref} items={items} command={command} />,
    )
  }

  destroy() {
    // React 19's createRoot needs an out-of-render-cycle unmount, else
    // it logs a warning. setTimeout 0 is enough.
    setTimeout(() => {
      try { this.root.unmount() } catch { /* ignore */ }
      if (this.el.parentNode) this.el.parentNode.removeChild(this.el)
    }, 0)
  }
}

function makeSuggestion(): Partial<SuggestionOptions> {
  return {
    char: '@',
    // Allow the popup to keep matching after a space — most names have one.
    allowSpaces: false,
    // Default suggestion rules only trigger when `@` follows whitespace or
    // starts a line. Chinese prose has no spaces, so in a CJK document the
    // popup NEVER opened ("按 @ 没反应，艾特不了人"). null = any prefix
    // char is fine. Trade-off: typing a literal email like a@b.com pops
    // the picker for a beat — Esc dismisses it and typing on past a
    // non-match closes it, so the annoyance is minor next to CJK users
    // having no mentions at all.
    allowedPrefixes: null,
    items: ({ query }: { query: string }) => {
      // Pull the current participants snapshot directly — non-reactive.
      // The popup re-renders on every keystroke (TipTap calls `items`
      // each input), so we don't need React reactivity here.
      const byId = useParticipants.getState().byId
      const all: Participant[] = Object.values(byId)
      return filterMentionCandidates(all, query)
    },
    render: () => {
      let popup: MentionPopup | null = null
      // Keep a handle on the latest `command` so MentionList's
      // selection callback (captured at render time) always reaches
      // the most-recent TipTap command function — TipTap rebuilds it
      // on every `onUpdate`.
      let latestCommand: ((item: { id: string; label: string }) => void) | null = null
      const repaint = (props: { items: Participant[]; command: (item: { id: string; label: string }) => void; clientRect: (() => DOMRect | null) | null | undefined }) => {
        if (!popup) return
        latestCommand = props.command
        popup.render(props.items, (p) => latestCommand?.(p))
        const rect = props.clientRect ? props.clientRect() : null
        popup.setRect(rect)
      }
      return {
        onStart: (props) => {
          popup = new MentionPopup()
          repaint(props as never)
        },
        onUpdate: (props) => { repaint(props as never) },
        onKeyDown: (props) => {
          if (props.event.key === 'Escape') {
            popup?.destroy(); popup = null
            return true
          }
          return popup?.ref.current?.onKeyDown({ event: props.event }) ?? false
        },
        onExit: () => {
          popup?.destroy(); popup = null
        },
      }
    },
  }
}

/** Configured Mention extension. The committed node stores `{ id, label }`;
 *  the renderer surfaces `@<label>` chips that get the `.mention` class
 *  so globals.css can paint them. */
export function buildMentionExtension() {
  return Mention.configure({
    HTMLAttributes: { class: 'mention' },
    renderText: ({ node }) => `@${String(node.attrs.label ?? node.attrs.id ?? '')}`,
    suggestion: makeSuggestion() as never,
  })
}
