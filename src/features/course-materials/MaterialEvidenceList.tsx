// Adapted from Retab SourceFieldList + InteractiveItemList, MIT © 2026 Retab.
// Pinned sources and modifications: third_party/retab-segments/README.md.
import { useRef } from 'react'
import { cn } from '@/lib/utils'
import type { MaterialEvidence } from './segment-evidence'

export function MaterialEvidenceList({ matches, selectedId, previewId, hasPosition, onSelect, onPreview }: {
  matches: MaterialEvidence[]
  selectedId: string | null
  previewId: string | null
  hasPosition(match: MaterialEvidence): boolean
  onSelect(match: MaterialEvidence): void
  onPreview(id: string | null): void
}) {
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  return <ul aria-label="语义命中片段" className="space-y-2">
    {matches.map((match, index) => {
      const selected = selectedId === match.chunkId
      const active = (previewId ?? selectedId) === match.chunkId
      return <li key={match.chunkId}>
        <button ref={element => { if (element) buttons.current.set(match.chunkId, element); else buttons.current.delete(match.chunkId) }}
          type="button" aria-pressed={selected} data-source-chunk={match.chunkId} data-active={active}
          className={cn('w-full rounded-lg border px-3 py-3 text-start text-sm outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            active ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-muted/60')}
          onClick={() => { onPreview(null); onSelect(match) }}
          onFocus={() => onPreview(match.chunkId)} onBlur={() => onPreview(null)}
          onMouseEnter={() => onPreview(match.chunkId)} onMouseLeave={() => onPreview(null)}
          onKeyDown={event => {
            const target = event.key === 'ArrowDown' ? Math.min(matches.length - 1, index + 1)
              : event.key === 'ArrowUp' ? Math.max(0, index - 1) : event.key === 'Home' ? 0
                : event.key === 'End' ? matches.length - 1 : null
            if (target !== null) { event.preventDefault(); buttons.current.get(matches[target].chunkId)?.focus() }
            if (event.key === 'Escape') onPreview(null)
          }}>
          <span className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>片段 {index + 1}</span><span>{selected ? '已选中 · ' : ''}{hasPosition(match) ? '可定位解析文本' : '仅摘录'}</span>
          </span>
          <span className="mt-2 block line-clamp-4 whitespace-pre-wrap break-words leading-6">{match.excerpt}</span>
          <span className="mt-2 block break-words text-xs text-muted-foreground">来源：{match.sourceTitle}</span>
        </button>
      </li>
    })}
  </ul>
}
