import type { ThreadMessage } from '@assistant-ui/react'

type Row = { key: string; id: string; index: number }
type Chrome = { rows: Row[]; messageCount: number; first?: { createdAt: Date; timestampMissing: boolean }; readReceiptKey: string; branchKey: string }

/** Body deltas belong to the message primitives, not the surrounding viewport. */
export function createThreadChromeSelector(keyOf: (message: ThreadMessage) => string) {
  const entries = new WeakMap<ThreadMessage, { row: Row | null; receipt: unknown[] | null; branch: unknown }>()
  let previous: Chrome | undefined
  return (messages: readonly ThreadMessage[]): Chrome => {
    const rows: Row[] = [], receipts: unknown[][] = [], branches: unknown[] = []
    messages.forEach((message, index) => {
      let entry = entries.get(message)
      if (!entry || entry.row && entry.row.index !== index) {
        const value = message.metadata.custom
        entry = { row: value.schema === 'lingxiloop.thread-message.v2' ? { key: keyOf(message), id: String(value.clientMessageId), index } : null,
          receipt: typeof value.sequence === 'number' ? [value.clientMessageId, value.sequence] : null, branch: value.replyBranches }
        entries.set(message, entry)
      }
      if (entry.row) rows.push(entry.row)
      if (entry.receipt) receipts.push(entry.receipt)
      if (entry.branch) branches.push(entry.branch)
    })
    const first = messages[0] && { createdAt: messages[0].createdAt, timestampMissing: messages[0].metadata.custom.timestampMissing === true }
    const stableRows = previous && previous.rows.length === rows.length && rows.every((row, i) => {
      const old = previous!.rows[i]!
      return row.key === old.key && row.id === old.id && row.index === old.index
    }) ? previous.rows : rows
    const next: Chrome = { rows: stableRows, messageCount: messages.length, first, readReceiptKey: JSON.stringify(receipts), branchKey: JSON.stringify(branches) }
    if (previous && next.rows === previous.rows && next.messageCount === previous.messageCount
      && next.readReceiptKey === previous.readReceiptKey && next.branchKey === previous.branchKey
      && first?.createdAt.getTime() === previous.first?.createdAt.getTime() && first?.timestampMissing === previous.first?.timestampMissing) return previous
    previous = next
    return next
  }
}

function questionPreview(message: ThreadMessage) {
  const text = message.content.flatMap(part => part.type === 'text' ? [part.text] : []).join(' ').replace(/\s+/g, ' ').trim()
  const attachments = [
    ...(message.role === 'user' ? message.attachments.map(attachment => attachment.name) : []),
    ...message.content.flatMap(part => part.type === 'image' ? [part.filename || '图片'] : part.type === 'file' ? [part.filename || '文件'] : []),
  ]
  const summary = text || (attachments.length ? `附件：${attachments.join('、')}` : '无文字提问')
  return summary.length > 100 ? `${summary.slice(0, 100)}…` : summary
}

export function createQuestionSelector() {
  const cache = new WeakMap<ThreadMessage, { id: string; preview: string }>()
  let previous: { id: string; preview: string }[] = []
  return (messages: readonly ThreadMessage[]) => {
    const questions = messages.flatMap(message => {
      if (message.role !== 'user' || message.metadata.custom.schema !== 'lingxiloop.thread-message.v2') return []
      let question = cache.get(message)
      if (!question) { question = { id: String(message.metadata.custom.clientMessageId), preview: questionPreview(message) }; cache.set(message, question) }
      return [question]
    })
    if (questions.length === previous.length && questions.every((q, i) => q.id === previous[i]!.id && q.preview === previous[i]!.preview)) return previous
    previous = questions
    return questions
  }
}
