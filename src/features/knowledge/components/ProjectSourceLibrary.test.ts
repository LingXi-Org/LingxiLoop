import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const drive = read('./PersonalSourceDrive.tsx')
const courseDrive = read('./CourseSourceDrive.tsx')
const library = read('./ProjectSourceLibrary.tsx')
const dashboard = read('../../learning/dashboard/LearningDashboardPanel.tsx')
const frame = read('../../learning/dashboard/DashboardSectionFrame.tsx')
const calendar = read('../../calendar/components/CalendarView.tsx')
const settings = read('../../learning/dashboard/CourseSettingsSection.tsx')
const desktop = read('../../../desktop/DesktopApp.tsx')
const api = read('../api.ts')

test('Dashboard resources stay role scoped instead of opening a Drawer', () => {
  assert.match(dashboard, /section === 'resources'[\s\S]*<PersonalSourceDrive[\s\S]*<CourseSourceDrive/)
  assert.match(drive, /<DashboardSectionFrame[\s\S]*section="resources"/)
  assert.match(courseDrive, /<DashboardSectionFrame[\s\S]*section="resources"/)
  assert.match(desktop, /const dashboardOpen = view !== 'conversations'/)
  assert.doesNotMatch(desktop, /libraryOpen|drawerContent = <PersonalSourceDrive/)
  assert.doesNotMatch(drive, /<Drawer|DrawerContent/)
  assert.doesNotMatch(drive, /font-heading text-xl font-medium">工作区资料夹|每个文件夹对应一个独立工作区/)
  assert.doesNotMatch(`${drive}\n${library}`, /min-h-20[\s\S]*border-b border-border\/60/)
})

test('Dashboard subsidiary navigation stays in the owning top bar', () => {
  assert.match(frame, /breadcrumb\?: \{ root: string; current: string; onBack\(\): void \}/)
  assert.match(courseDrive, /breadcrumb=\{openFolder \? \{ root: '班级资料', current: openFolder\.name/)
  assert.match(drive, /breadcrumb=\{\{ root: '个人学习资料', current: openFolder\.name/)
  assert.doesNotMatch(library, /Breadcrumb|ArrowLeft01Icon/)
  const calendarHeader = calendar.match(/<header[\s\S]*?<\/header>/)?.[0] ?? ''
  assert.match(calendarHeader, /headerLabel[\s\S]*上一时间段[\s\S]*日历视图[\s\S]*新事件/)
  assert.match(frame, /headerActions\?: ReactNode[\s\S]*\{headerActions \? <div/)
  assert.match(settings, /headerActions=\{<TabsList[\s\S]*variant="line"[\s\S]*after:bottom-0/)
  assert.doesNotMatch(settings, /ResizeObserver|orientation=|group-data-vertical/)
  assert.doesNotMatch(dashboard, /section="settings"><CourseSettingsSection/)
})

test('Personal drive aggregates accessible spaces and opens project-scoped source grids', () => {
  assert.match(drive, /Folder01Icon/)
  assert.match(drive, /size-20[\s\S]*size-12/)
  assert.match(drive, /for \(const space of spaces\)/)
  assert.match(drive, /kind !== 'PERSONAL_LEARNING'/)
  assert.match(drive, /onOpenLearningSpace\(folder\.id\)/)
  assert.match(drive, /folder\.sourceCount/)
  assert.match(drive, /<ProjectSourceLibrary[\s\S]*projectId=\{openFolder\.id\}/)
  assert.match(drive, /<ResourceSkeleton variant="cards"/)
  assert.match(library, /<ResourceSkeleton variant="cards"/)
})

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
