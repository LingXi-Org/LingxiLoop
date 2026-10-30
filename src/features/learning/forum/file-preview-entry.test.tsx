import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
const { AttachmentCard } = await import('@/components/assistant-ui/elements/attachment-card')
const { ForumAttachments, ForumFileOpen } = await import('./ForumAttachments')

test('conversation and course attachment entries expose preview buttons', () => {
  const chat = renderToStaticMarkup(<AttachmentCard filename="notes.pdf" data="file-key" sourceType="id" mimeType="application/pdf" />)
  assert.match(chat, /aria-label="预览附件：notes\.pdf"/)
  assert.doesNotMatch(chat, /target="_blank"/)
  const file = { key: 'synthetic', name: 'notes.pdf' }
  const forum = renderToStaticMarkup(<ForumAttachments attachments={[file]} />)
  assert.match(forum, /<button[^>]*>notes\.pdf<\/button>/)
  const editor = renderToStaticMarkup(<ForumFileOpen file={file}>notes.pdf</ForumFileOpen>)
  assert.match(editor, /<button[^>]*>notes\.pdf<\/button>/)
})
