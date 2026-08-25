import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTextPreview, inferAttachmentPreview, inferTextPreviewFormat, readTextPreview, tokenizeJsonPreview } from './attachmentPreview'

test('infers preview kind from MIME and extension', () => {
  assert.equal(inferAttachmentPreview({ name: 'brief.pdf', kind: 'file' }), 'pdf')
  assert.equal(inferAttachmentPreview({ name: 'clip.bin', kind: 'file', mime: 'video/mp4' }), 'video')
  assert.equal(inferAttachmentPreview({ name: 'notes.md', kind: 'file' }), 'text')
  assert.equal(inferAttachmentPreview({ name: 'archive.zip', kind: 'file' }), 'download')
})

test('reads and formats safe text without evaluating content', async () => {
  const source = await readTextPreview(new Response('{"ok":true}'))
  assert.equal(formatTextPreview('sample.json', source), '{\n  "ok": true\n}')
})

test('distinguishes markdown, JSON, and plain text documents', () => {
  assert.equal(inferTextPreviewFormat('notes.md'), 'markdown')
  assert.equal(inferTextPreviewFormat('payload.JSON'), 'json')
  assert.equal(inferTextPreviewFormat('readme.txt'), 'plain')
})

test('tokenizes JSON without turning source text into HTML', () => {
  const tokens = tokenizeJsonPreview('{"name":"<script>","count":2,"ok":true,"value":null}')
  assert.deepEqual(tokens.filter((token) => token.kind !== 'plain').map((token) => token.kind), ['key', 'string', 'key', 'number', 'key', 'boolean', 'key', 'null'])
  assert.equal(tokens.map((token) => token.value).join(''), '{"name":"<script>","count":2,"ok":true,"value":null}')
})

test('rejects oversized text from content length', async () => {
  await assert.rejects(() => readTextPreview(new Response('x', { headers: { 'content-length': '99' } }), 10), /上限/)
})
