import { useMemo, useState, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TwEmoji } from '@/components/TwEmoji'

/** 常用 first, then a compact general set; keywords make the search useful in Chinese. */
const EMOJI: { emoji: string; words: string }[] = [
  { emoji: '👍', words: '赞 好 同意 like' }, { emoji: '❤️', words: '爱心 喜欢 love' }, { emoji: '😂', words: '笑 哭 哈哈' },
  { emoji: '🤔', words: '思考 疑问 想' }, { emoji: '🎉', words: '庆祝 恭喜 撒花' }, { emoji: '👀', words: '看 关注 眼睛' },
  { emoji: '🙏', words: '谢谢 拜托 感谢' }, { emoji: '✅', words: '完成 对 确认' }, { emoji: '🔥', words: '火 厉害 热' },
  { emoji: '💡', words: '想法 灵感 主意' }, { emoji: '👏', words: '鼓掌 棒' }, { emoji: '😮', words: '惊讶 哇' },
  { emoji: '😅', words: '尴尬 汗' }, { emoji: '📌', words: '置顶 标记 重点' }, { emoji: '⭐', words: '星 收藏 重要' },
  { emoji: '❓', words: '问号 问题 不懂' }, { emoji: '😊', words: '微笑 开心' }, { emoji: '😢', words: '难过 哭' },
  { emoji: '💪', words: '加油 努力' }, { emoji: '🚀', words: '火箭 起飞 快' }, { emoji: '👌', words: '好的 可以 ok' },
  { emoji: '🙌', words: '欢呼 太好了' }, { emoji: '📝', words: '笔记 记录 作业' }, { emoji: '❗', words: '注意 重要' },
]

export function EmojiPicker({ onPick, children, align = 'start' }: { onPick: (emoji: string) => void; children: ReactNode; align?: 'start' | 'end' | 'center' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const value = query.trim().toLowerCase()
    return value ? EMOJI.filter(item => item.words.includes(value) || item.emoji === value) : EMOJI
  }, [query])
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery('') }}>
    <PopoverTrigger asChild>{children}</PopoverTrigger>
    <PopoverContent align={align} sideOffset={6} className="flex w-[330px] flex-col gap-2 rounded-xl border-0 p-2 shadow-[var(--popover-shadow)]">
      <label className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-[13px] text-muted-foreground">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 shrink-0"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索表情" aria-label="搜索表情"
          className="min-w-0 flex-1 border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
      </label>
      <span className="px-0.5 text-[11.5px] text-muted-foreground">{query.trim() ? `结果 · ${shown.length}` : '常用'}</span>
      <div role="listbox" aria-label="选择表情" className="grid grid-cols-8 gap-0.5">
        {shown.map(item => <button key={item.emoji} type="button" role="option" aria-selected={false} aria-label={`使用 ${item.emoji} 回应`}
          onClick={() => { onPick(item.emoji); setOpen(false); setQuery('') }}
          className="grid h-[34px] place-items-center rounded-lg hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
          <TwEmoji emoji={item.emoji} size={19} />
        </button>)}
        {shown.length === 0 && <p className="col-span-8 py-3 text-center text-xs text-muted-foreground">没有匹配的表情</p>}
      </div>
    </PopoverContent>
  </Popover>
}
