import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const drive = read('./PersonalSourceDrive.tsx')
const library = read('./ProjectSourceLibrary.tsx')
const dashboard = read('../../learning/dashboard/LearningDashboardPanel.tsx')
const desktop = read('../../../desktop/DesktopApp.tsx')
const api = read('../api.ts')

test('Dashboard library is an independent workspace-folder page instead of a Drawer', () => {
  assert.match(dashboard, /section === 'resources'\) return <PersonalSourceDrive \/>/)
  assert.match(desktop, /const dashboardOpen = view !== 'conversations'/)
  assert.doesNotMatch(desktop, /libraryOpen|drawerContent = <PersonalSourceDrive/)
  assert.doesNotMatch(drive, /<Drawer|DrawerContent/)
})

test('Personal drive uses large real folder marks and opens project-scoped source grids', () => {
  assert.match(drive, /Folder01Icon/)
  assert.match(drive, /size-20[\s\S]*size-12/)
  assert.match(drive, /workspace\.sourceCount/)
  assert.match(drive, /<ProjectSourceLibrary[\s\S]*projectId=\{openFolder\.id\}/)
  assert.match(drive, /<ResourceSkeleton variant="cards"/)
  assert.match(library, /<ResourceSkeleton variant="cards"/)
})

test('Folder and source context menus expose real CRUD with confirmation and Toast feedback', () => {
  assert.match(drive, /<ContextMenu[\s\S]*新建同级文件夹[\s\S]*打开文件夹[\s\S]*重命名[\s\S]*永久删除/)
  assert.match(drive, /knowledgeApi\.createProject/)
  assert.match(drive, /knowledgeApi\.updateProject/)
  assert.match(drive, /confirmSensitiveAction\([\s\S]*knowledgeApi\.(?:archiveProject|deleteProject)/)
  assert.match(library, /<ContextMenu[\s\S]*打开资料[\s\S]*重命名[\s\S]*删除资料/)
  assert.match(library, /knowledgeApi\.renameProjectSource/)
  assert.match(library, /confirmSensitiveAction\([\s\S]*toastAction\(knowledgeApi\.deleteProjectSource/)
  assert.match(api, /method: 'PATCH'/)
})

test('Source creation and preview remain project scoped', () => {
  assert.match(library, /<KnowledgeSourceUploadDialog/)
  assert.match(library, /knowledgeApi\.uploadProjectSource/)
  assert.match(library, /knowledgeApi\.getProjectSource\(projectId, source\.id\)/)
  assert.match(library, /<Dialog open=\{selected !== null\}/)
  assert.doesNotMatch(library, /DocumentsView|DocumentEditor|grid-cols-\[240px_/)
})
