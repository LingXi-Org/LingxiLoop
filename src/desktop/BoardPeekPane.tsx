import { useApp } from '@/stores/app'
import { useBoards } from '@/stores/boards'
import { BoardPeekContent } from '@/components/ArtifactPeekContent'

export function BoardPeekPane() {
  const boardId = useApp((s) => s.openBoardId)
  const cardId = useApp((s) => s.openBoardCardId)
  const closeBoardPeek = useApp((s) => s.closeBoardPeek)
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
