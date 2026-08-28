import { useEffect, useRef, useState } from 'react'
import { SkypeEmoji } from '@/components/SkypeEmoji'
import { TwEmoji } from '@/components/TwEmoji'
import { COMPOSER_EMOJIS } from '@/lib/emoji'
import { playSkypeSound, SKYPE_EMOJIS } from '@/lib/skypeEmojis'
import { cn } from '@/lib/utils'
import { useSoundStore } from '@/stores/sound'

type EmojiTab = 'std' | 'skype'
const EMOJI_TAB_STORAGE_KEY = 'lingxiloop.composer.emojiTab'

function readInitialEmojiTab(): EmojiTab {
  if (typeof window === 'undefined') return 'std'
  try { return window.localStorage.getItem(EMOJI_TAB_STORAGE_KEY) === 'skype' ? 'skype' : 'std' }
  catch { return 'std' }
}

export function ComposerEmojiPopover({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [tab, setTabState] = useState<EmojiTab>(readInitialEmojiTab)
  const setTab = (next: EmojiTab) => {
    setTabState(next)
    try { window.localStorage.setItem(EMOJI_TAB_STORAGE_KEY, next) } catch { /* private mode */ }
  }

  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    const frame = requestAnimationFrame(() => document.addEventListener('mousedown', onDocumentMouseDown))
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('mousedown', onDocumentMouseDown)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="app-menu-surface absolute bottom-full left-0 z-30 mb-2 px-2 py-2 animate-rise"
      style={{ width: tab === 'skype' ? 332 : 260 }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="mb-2 flex gap-1 px-0.5">
        {(['std', 'skype'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex-1 rounded-[6px] py-1 text-[11px] font-semibold uppercase tracking-wider transition',
              tab === key ? 'bg-sky2-100 text-skype-deep' : 'text-ink-500 hover:bg-sky2-50',
            )}
          >{key === 'std' ? '常用表情' : 'LingxiLoop 表情'}</button>
        ))}
      </div>
      {tab === 'std' ? (
        <div className="grid grid-cols-6 gap-1">
          {COMPOSER_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => onPick(emoji)} className="grid size-10 place-items-center rounded transition hover:bg-sky2-50" title={emoji}>
              <TwEmoji emoji={emoji} size={20} />
            </button>
          ))}
        </div>
      ) : (
        <div className="grid max-h-[360px] grid-cols-7 gap-1 overflow-y-auto pr-0.5">
          {SKYPE_EMOJIS.map((emoji) => (
            <button
              key={emoji.key}
              type="button"
              onClick={() => {
                onPick(emoji.shortcodes[0])
                if (!useSoundStore.getState().muted) playSkypeSound(emoji.key)
              }}
              className="grid size-10 place-items-center rounded transition hover:bg-sky2-50"
              title={`${emoji.label} — ${emoji.shortcodes[0]}`}
            >
              <SkypeEmoji name={emoji.key} size={26} autoPlaySound={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
