import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectCategory } from './viewer-source'

test('dispatches supported files and leaves old Office and archives for download', () => {
  for (const [name, mime, expected] of [
    ['notes.pdf', 'application/pdf', 'pdf'], ['lesson.docx', '', 'docx'], ['book.xls', '', 'xlsx'],
    ['slides.pptx', '', 'pptx'], ['song.mp3', '', 'audio'], ['clip.mp4', '', 'video'],
    ['archive.zip', 'application/zip', 'unsupported'], ['old.ppt', 'application/vnd.ms-powerpoint', 'unsupported'],
    ['old.doc', 'application/msword', 'unsupported'], ['script.ts', '', 'text'],
  ]) assert.equal(detectCategory(name, mime), expected, name)
})
