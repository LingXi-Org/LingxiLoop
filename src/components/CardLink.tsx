import { useEffect, useRef } from 'react'
import { useApp } from '@/stores/app'
import { useBoards } from '@/stores/boards'
import { useResolvedCardId } from '@/lib/useArtifactId'
import { IBoard } from './icons'
import type { BoardCardLookup } from '@/types'

export function CardLink({ id: rawId }: { id: string }) {
  // Resolve a git-style short id to the full card id (best-effort: cards are
  // only loaded per opened board, so an unopened board's card stays short).
  const id = useResolvedCardId(rawId)
  const setView = useApp((s) => s.setView)
  const view = useApp((s) => s.view)
  const openBoardPeek = useApp((s) => s.openBoardPeek)
  const selectBoard = useBoards((s) => s.selectBoard)
  const loadCard = useBoards((s) => s.loadCard)
  const loadingCardId = useBoards((s) => s.loadingCardId)
  const lookup = useBoards((s) => s.cardLookups[id])
  const didRequestCard = useRef(false)

  useEffect(() => {
    if (!lookup && loadingCardId !== id && !didRequestCard.current) {
      didRequestCard.current = true
      void loadCard(id).catch(() => { /* stale or missing card reference */ })
    }
  }, [id, loadCard, loadingCardId, lookup])

  const label = lookup?.card.title.trim() || id

  const open = (resolved: BoardCardLookup) => {
    selectBoard(resolved.board.id)
    if (view === 'conversations') openBoardPeek(resolved.board.id, id)
    else setView('boards')
  }

  return (
    <a
      href={`#cards/${id}`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (lookup) {
          open(lookup)
          return
        }
        void loadCard(id)
          .then(open)
          .catch(() => {
            if (view !== 'conversations') setView('boards')
          })
      }}
      className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full border border-sky2-100 bg-sky2-50 px-2 py-0.5 text-[13px] font-semibold text-skype-deep no-underline transition hover:border-sky2-200 hover:bg-[#EAF7FD]"
      style={{ verticalAlign: '-0.16em' }}
      title={`Open card ${id}`}
      aria-label={`Open card ${label}`}
    >
      <IBoard className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </a>
  )
}
