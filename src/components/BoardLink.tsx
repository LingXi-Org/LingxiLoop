import { useEffect, useRef } from 'react'
import { useApp } from '@/stores/app'
import { useBoards } from '@/stores/boards'
import { useResolvedBoardId } from '@/lib/useArtifactId'
import { IBoard } from './icons'

export function BoardLink({ id: rawId }: { id: string }) {
  // Resolve a git-style short id (e.g. `board-ab12`) to the full board id.
  const id = useResolvedBoardId(rawId)
  const setView = useApp((s) => s.setView)
  const view = useApp((s) => s.view)
  const openBoardPeek = useApp((s) => s.openBoardPeek)
  const selectBoard = useBoards((s) => s.selectBoard)
  const loadList = useBoards((s) => s.loadList)
  const loadingList = useBoards((s) => s.loadingList)
  const summary = useBoards((s) => s.list.find((b) => b.id === id))
  const snapshot = useBoards((s) => s.snapshots[id])
  const label = snapshot?.title?.trim() || summary?.title?.trim() || id
  const didRequestList = useRef(false)

  useEffect(() => {
    if (!summary && !loadingList && !didRequestList.current) {
      didRequestList.current = true
      void loadList().catch(() => { /* stale or missing board reference */ })
    }
  }, [loadList, loadingList, summary])

  return (
    <a
      href={`#boards/${id}`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        selectBoard(id)
        if (view === 'conversations') openBoardPeek(id)
        else setView('boards')
      }}
      className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full border border-sky2-100 bg-sky2-50 px-2 py-0.5 text-[13px] font-semibold text-skype-deep no-underline transition hover:border-sky2-200 hover:bg-[#EAF7FD]"
      style={{ verticalAlign: '-0.16em' }}
      title={`Open board ${id}`}
      aria-label={`Open board ${label}`}
    >
      <IBoard className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </a>
  )
}
