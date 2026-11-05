import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canonicalUploadMime } from '../../../shared/upload-mime.js'

test('normal code/image/document browser MIME aliases retain their original formats', () => {
  for (const [name, mime, expected] of [
    ['answer.py', '', 'text/plain'], ['answer.py', 'text/x-python', 'text/plain'],
    ['answer.py', 'application/x-python-code', 'text/plain'], ['run.png', '', 'image/png'],
    ['material.pdf', 'application/octet-stream', 'application/pdf'],
    ['材料D.docx', 'application/zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['notes.docx', '', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ]) assert.equal(canonicalUploadMime(name, mime), expected)
  assert.equal(canonicalUploadMime('program.exe', ''), 'application/octet-stream')
  assert.equal(canonicalUploadMime('image.png', 'application/x-msdownload'), 'application/x-msdownload')
})
