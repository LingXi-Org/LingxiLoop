import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  KNOWLEDGE_ATTACHMENT_MIMES,
  MAX_SOURCE_BYTES,
  isKnowledgeAttachmentMime,
  openNotebookEnabled,
  validateKnowledgeUrl,
} from '../modules/knowledge/public.js'

test('native Open Notebook ingestion accepts the supported attachment contract', () => {
  const previous = process.env.OPEN_NOTEBOOK_ENABLED
  process.env.OPEN_NOTEBOOK_ENABLED = 'true'
  try {
    assert.equal(openNotebookEnabled(), true)
    assert.equal(isKnowledgeAttachmentMime('application/pdf', 1024), true)
    assert.equal(isKnowledgeAttachmentMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1024), true)
    assert.equal(isKnowledgeAttachmentMime('audio/mpeg', 1024), true)
    assert.equal(isKnowledgeAttachmentMime('application/zip', 1024), false)
    assert.equal(isKnowledgeAttachmentMime('application/pdf', MAX_SOURCE_BYTES + 1), false)
  } finally {
    if (previous === undefined) delete process.env.OPEN_NOTEBOOK_ENABLED
    else process.env.OPEN_NOTEBOOK_ENABLED = previous
  }
})

test('supported attachment types are explicit and do not include archives', () => {
  assert.ok(KNOWLEDGE_ATTACHMENT_MIMES.has('application/pdf'))
  assert.ok(KNOWLEDGE_ATTACHMENT_MIMES.has('text/plain'))
  assert.equal(KNOWLEDGE_ATTACHMENT_MIMES.has('application/zip'), false)
})

test('knowledge URL validator rejects local, credentialed, and non-http targets', async () => {
  await assert.rejects(validateKnowledgeUrl('http://localhost/admin'), /blocked/)
  await assert.rejects(validateKnowledgeUrl('http://127.0.0.1/private'), /blocked/)
  await assert.rejects(validateKnowledgeUrl('file:///etc/passwd'), /http or https/)
  await assert.rejects(validateKnowledgeUrl('https://user:pass@example.com'), /credentials/)
})

test('native ingestion preserves the public upload limit', () => {
  assert.equal(MAX_SOURCE_BYTES, 25 * 1024 * 1024)
})
