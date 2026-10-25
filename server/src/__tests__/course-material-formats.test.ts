import assert from 'node:assert/strict'
import { test } from 'node:test'
import { presignSourceRequestSchema } from '../modules/knowledge/contracts.js'
import { KNOWLEDGE_ATTACHMENT_MIMES, SOURCE_FILE_EXTENSIONS, sourceFileSignatureMatches } from '../modules/knowledge/policy.js'

test('original-file contracts accept every supported format and reject client ownership', () => {
  for (const mime of Object.keys(SOURCE_FILE_EXTENSIONS)) {
    const input = { idempotencyKey: 'test-upload-1', name: 'file', mime, size: 10 }
    assert.equal(presignSourceRequestSchema.safeParse(input).success, true, mime)
    assert.equal(presignSourceRequestSchema.safeParse({ ...input, visibilityScope: 'PROJECT' }).success, false)
    assert.equal(presignSourceRequestSchema.safeParse({ ...input, ownerUserId: 'another-student' }).success, false)
  }
  assert.equal(presignSourceRequestSchema.safeParse({ idempotencyKey: 'test-upload-1', name: '../file', mime: 'image/png', size: 10 }).success, false)
})

test('new binary formats validate signatures without entering the existing indexing allowlist', () => {
  const fixtures: Array<[string, Buffer]> = [
    ['image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1])],
    ['image/jpeg', Buffer.from([255, 216, 255, 224, 1])],
    ['application/zip', Buffer.from([80, 75, 5, 6, 0])],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', Buffer.from('PK\x03\x04[Content_Types].xml ppt/presentation.xml')],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', Buffer.from('PK\x03\x04[Content_Types].xml xl/workbook.xml')],
  ]
  for (const [mime, bytes] of fixtures) {
    assert.equal(sourceFileSignatureMatches(mime, bytes), true, mime)
    assert.equal(sourceFileSignatureMatches(mime, Buffer.from('invalid file')), false, mime)
    assert.equal(KNOWLEDGE_ATTACHMENT_MIMES.has(mime), false, mime)
  }
  assert.equal(sourceFileSignatureMatches(fixtures[3]![0], fixtures[4]![1]), false)
})
