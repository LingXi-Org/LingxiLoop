export interface BoardSummary {
  id: string
  title: string
  description: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface BoardColumn {
  id: string
  title: string
  position: number
  createdAt: string
}

export interface BoardCard {
  id: string
  boardId: string
  columnId: string
  title: string
  description: string | null
  position: number
  assigneeId: string | null
  mentions: string[]
  commentCount: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface BoardCardComment {
  id: string
  authorId: string
  body: string
  mentions: string[]
  createdAt: string
}

export interface BoardSnapshot extends BoardSummary {
  columns: BoardColumn[]
  cards: BoardCard[]
}

export interface BoardCardLookup {
  board: BoardSummary
  column: BoardColumn
  card: BoardCard
}
