import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const library = readFileSync(new URL('./ProjectSourceLibrary.tsx', import.meta.url), 'utf8')
const dashboard = readFileSync(new URL('../../learning/dashboard/LearningDashboardPanel.tsx', import.meta.url), 'utf8')
const api = readFileSync(new URL('../api.ts', import.meta.url), 'utf8')

test('learning dashboards use the Project Notebook source library instead of document editing', () => {
  assert.match(dashboard, /section === 'resources'\) return <ProjectSourceLibrary projectId=\{space\.projectId\} canManage=\{space\.canManage\}/)
  assert.doesNotMatch(dashboard, /DocumentsView/)
  assert.match(api, /\/projects\/\$\{encodeURIComponent\(projectId\)\}\/sources/)
})

test('Project source library is one responsive grid with loading and Dialog preview', () => {
  assert.match(library, /<ResourceSkeleton variant="cards"/)
  assert.match(library, /sm:grid-cols-2 xl:grid-cols-3/)
  assert.match(library, /<Dialog open=\{selected !== null\}/)
  assert.match(library, /knowledgeApi\.getProjectSource\(projectId, source\.id\)/)
  assert.match(library, /canManage \|\| selected\.createdBy === me\?\.id/)
  assert.doesNotMatch(library, /DocumentsView|DocumentEditor|grid-cols-\[240px_/)
})

test('Project source management keeps global confirmation and Toast lifecycle', () => {
  assert.match(library, /confirmSensitiveAction\([\s\S]*?toastAction\(knowledgeApi\.deleteProjectSource/)
  assert.match(library, /toastAction\(Promise\.all\(files\.map/)
  assert.match(library, /toastAction\(knowledgeApi\.retryProjectSource/)
})
