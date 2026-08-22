import { IAgent, IAgents, IChat, IComputer, IDoc } from '@/components/icons'
import { useApp } from '@/stores/app'
import { isMuted, useConversations } from '@/stores/conversations'
import type { ViewKey } from '@/types'
import { Pressable } from './Pressable'

const tabs: Array<{ key: ViewKey['view']; Icon: typeof IChat; label: string }> = [
  { key: 'conversations', Icon: IChat, label: '对话' },
  { key: 'agents', Icon: IAgent, label: '智能体' },
  { key: 'computer', Icon: IComputer, label: '电脑' },
  { key: 'library', Icon: IDoc, label: '资料库' },
  { key: 'me', Icon: IAgents, label: '我的' },
]

/**
 * MobileTabBar — modeled on UIKit's UITabBarController.
 *
 * Visual model is deliberately minimal: the only signal for selection
 * is icon weight (1.5px stroke → 2px) + tint (ink-500 → skype). No
 * "indicator dot", no scale-on-tap, no bounce — UITabBarController
 * doesn't do any of that, and adding it visibly tells iOS users
 * "this is a web app". The blur backdrop + safe-area-inset padding
 * is the structural piece that matches native chrome.
 */
export function MobileTabBar() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const select = useApp((s) => s.selectConversation)
  const totalUnread = useConversations((s) =>
    s.list.reduce((acc, c) => acc + (isMuted(c) ? 0 : (c.unread ?? 0)), 0),
  )
  return (
    <nav
      className="mobile-chrome border-t border-ink-100 bg-cloud/95 backdrop-blur-md grid"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)', gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map(({ key, Icon, label }) => {
        const active = view === key
        const badge = key === 'conversations' && totalUnread > 0 ? totalUnread : undefined
        return (
          <Pressable
            key={key}
            onClick={() => {
              setView(key)
              if (key === 'conversations') select(null)
            }}
            noScale
            className="relative flex flex-col items-center gap-1 py-2.5"
            // Color transition — Tailwind's transition-colors gives us
            // the iOS-default smooth tint change without going through
            // framer-motion. Fast enough to feel snappy, slow enough
            // to read as "selection moved".
            style={{
              color: active ? 'var(--skype)' : 'var(--ink-500)',
              transition: 'color 150ms ease-out',
            }}
          >
            <span className="relative">
              <Icon
                className="w-[22px] h-[22px] transition-[stroke-width] duration-150"
                strokeWidth={active ? 2 : 1.5}
              />
              {badge !== undefined && (
                <span
                  className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold grid place-items-center"
                  style={{ background: 'var(--coral)', color: 'white', border: '2px solid var(--cloud)' }}
                >{badge}</span>
              )}
            </span>
            <span className="text-[10px] font-semibold tracking-wide">{label}</span>
          </Pressable>
        )
      })}
    </nav>
  )
}
