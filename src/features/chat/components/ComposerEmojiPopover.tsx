import { useState } from 'react'
import { SkypeEmoji } from '@/components/SkypeEmoji'
import { TwEmoji } from '@/components/TwEmoji'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { COMPOSER_EMOJIS } from '@/lib/emoji'
import { playSkypeSound, SKYPE_EMOJIS } from '@/lib/skypeEmojis'
import { useSoundStore } from '@/stores/sound'

type EmojiTab = 'std' | 'skype'
const EMOJI_TAB_STORAGE_KEY = 'lingxiloop.composer.emojiTab'

function readInitialEmojiTab(): EmojiTab {
  if (typeof window === 'undefined') return 'std'
  try { return window.localStorage.getItem(EMOJI_TAB_STORAGE_KEY) === 'skype' ? 'skype' : 'std' }
  catch { return 'std' }
}

export function ComposerEmojiPopover({ onPick }: { onPick: (emoji: string) => void }) {
  const [tab, setTabState] = useState<EmojiTab>(readInitialEmojiTab)
  const setTab = (next: EmojiTab) => {
    setTabState(next)
    try { window.localStorage.setItem(EMOJI_TAB_STORAGE_KEY, next) } catch { /* private mode */ }
  }

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as EmojiTab)} className={tab === 'skype' ? 'w-80' : 'w-60'}>
      <TabsList className="w-full">
        <TabsTrigger value="std">常用表情</TabsTrigger>
        <TabsTrigger value="skype">LingxiLoop 表情</TabsTrigger>
      </TabsList>
      <TabsContent value="std">
        <div className="grid grid-cols-6 gap-1">
          {COMPOSER_EMOJIS.map((emoji) => (
            <Button key={emoji} type="button" variant="ghost" size="icon-lg" onClick={() => onPick(emoji)} title={emoji}>
              <TwEmoji emoji={emoji} size={20} />
            </Button>
          ))}
        </div>
      </TabsContent>
      <TabsContent value="skype">
        <ScrollArea className="h-80">
          <div className="grid grid-cols-7 gap-1 pe-1">
            {SKYPE_EMOJIS.map((emoji) => (
              <Button key={emoji.key} type="button" variant="ghost" size="icon-lg" onClick={() => {
                onPick(emoji.shortcodes[0])
                if (!useSoundStore.getState().muted) playSkypeSound(emoji.key)
              }} title={`${emoji.label} — ${emoji.shortcodes[0]}`}>
                <SkypeEmoji name={emoji.key} size={26} autoPlaySound={false} />
              </Button>
            ))}
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}
