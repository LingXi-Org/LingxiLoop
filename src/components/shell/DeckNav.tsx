import { Add01Icon, Home01Icon, Presentation01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMemo, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSlides } from '@/features/slides/store'
import { useIsMobile } from '@/hooks/use-mobile'
import { SecondaryGroup, SecondaryItem, SecondaryPane, SecondarySearch } from './SecondaryPane'

/** Nested sidebar for Slides: search, create and the project's decks. */
export function DeckNav({ onNavigate }: { onNavigate?: () => void }) {
  const isMobile = useIsMobile()
  const decks = useSlides((state) => state.decks)
  const openId = useSlides((state) => state.openId)
  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const value = query.trim().toLocaleLowerCase()
    return value ? decks?.filter((deck) => deck.title.toLocaleLowerCase().includes(value)) : decks
  }, [decks, query])
  const open = (id: string | null) => { useSlides.getState().open(id); onNavigate?.() }

  return (
    <SecondaryPane
      label="演示文稿导航"
      header={<>
        <SecondarySearch value={query} onChange={setQuery} placeholder="搜索演示文稿" label="搜索演示文稿" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="新建演示文稿" className={isMobile ? 'size-11 shrink-0' : 'shrink-0'} onClick={() => void useSlides.getState().create()}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>新建演示文稿</TooltipContent>
        </Tooltip>
      </>}
    >
      {!query.trim() ? <SecondaryGroup><SecondaryItem label="全部演示文稿" icon={Home01Icon} selected={!openId} onSelect={() => open(null)} meta={decks?.length} /></SecondaryGroup> : null}
      <SecondaryGroup label={query.trim() ? '搜索结果' : '最近更新'}>
        {!visible ? <ResourceSkeleton variant="list" count={4} compact label="正在加载演示文稿" />
          : visible.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">{query.trim() ? '没有找到匹配的演示文稿' : '还没有演示文稿'}</li>
          : visible.map((deck) => <SecondaryItem key={deck.id} label={deck.title} icon={Presentation01Icon} selected={openId === deck.id} onSelect={() => open(deck.id)} />)}
      </SecondaryGroup>
    </SecondaryPane>
  )
}
