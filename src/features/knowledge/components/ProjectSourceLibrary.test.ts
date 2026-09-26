import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const courseDrive = read('./CourseSourceDrive.tsx')
const library = read('./ProjectSourceLibrary.tsx')
const api = read('../api.ts')

test('Course drive exposes learner and teacher virtual folders with read-only student review', () => {
  assert.match(courseDrive, /name: '公告资料'[\s\S]*visibilityScope: 'PROJECT'[\s\S]*readOnly: true/)
  assert.match(courseDrive, /name: '个人资料'[\s\S]*visibilityScope: 'PRIVATE'/)
  assert.match(courseDrive, /name: '公共资料'[\s\S]*visibilityScope: 'PROJECT'/)
  assert.match(courseDrive, /`\$\{member\.name\}个人资料`/)
  assert.match(courseDrive, /reviewMode=\{reviewMode\}/)
  assert.match(courseDrive, /readOnly=\{openFolder\.readOnly\}/)
  assert.match(library, /!readOnly && \(canManage \|\| source\.createdBy === me\?\.id\)/)
  assert.match(library, /knowledgeApi\.listCourseReviewSources/)
  assert.match(library, /knowledgeApi\.getCourseReviewSource/)
})

test('Folder and source context menus expose real CRUD with confirmation and Toast feedback', () => {
  assert.match(library, /knowledgeApi\.renameProjectSource/)
  assert.match(library, /confirmSensitiveAction\([\s\S]*toastAction\(knowledgeApi\.deleteProjectSource/)
  assert.match(api, /method: 'PATCH'/)
})

test('Source creation and preview remain project scoped', () => {
  assert.match(library, /<KnowledgeSourceUploadDialog/)
  assert.match(library, /uploadProjectSource\(projectId, file, revealPending\)/)
  assert.match(read('./KnowledgeSourceUploadDialog.tsx'), /reset\(\)[\s\S]*onOpenChange\(false\)[\s\S]*void onFiles\(allowed\)/)
  assert.match(library, /<ConversationSourceToggle[\s\S]*projectId=\{projectId\}/)
  assert.match(api, /onPending\?\.\(\)/)
  assert.match(library, /knowledgeApi\.getProjectSource\(projectId, source\.id\)/)
  assert.match(library, /<Dialog open=\{selected !== null\}/)
})
