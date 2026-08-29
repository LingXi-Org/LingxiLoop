import { useApp } from '@/stores/app'
import { useSurface } from '@/stores/surface'
import { useBoards } from '../state'
import { BoardPeekContent } from './BoardPeekContent'

export function BoardPeekPane() {
  const board = useSurface((s) => s.surface?.kind === 'board' ? s.surface : null)
  const boardId = board?.boardId ?? null
  const cardId = board?.cardId ?? null
  const closeBoardPeek = useSurface((s) => s.closeBoardPeek)
  const setView = useApp((s) => s.setView)
  const selectBoard = useBoards((s) => s.selectBoard)

  if (!boardId) return null

  const openFullWorkspace = () => {
    selectBoard(boardId)
    closeBoardPeek()
    setView('boards')
  }

  return (
    <aside className="min-w-0 h-full border-l border-ink-100 bg-cloud overflow-hidden">
      <BoardPeekContent
        boardId={boardId}
        focusCardId={cardId}
        onClose={closeBoardPeek}
        onOpenFull={openFullWorkspace}
      />
    </aside>
  )
}
