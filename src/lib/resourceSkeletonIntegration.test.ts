import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const skeleton = read('../components/ui/skeleton.tsx')
const resourceSkeleton = read('../components/ResourceSkeleton.tsx')
const resourceSkill = read('../../.agents/skills/lingxiloop-resource-loading/SKILL.md')

test('Skeleton remains byte-shaped like the official Luma primitive', () => {
  assert.match(skeleton, /data-slot="skeleton"/)
  assert.match(skeleton, /animate-pulse rounded-2xl bg-muted/)
  assert.match(skeleton, /React\.ComponentProps<"div">/)
  assert.doesNotMatch(skeleton, /variant|loading|spinner/i)
})

test('shared resource placeholders cover every global layout shape accessibly', () => {
  for (const variant of ['list', 'cards', 'detail', 'media', 'table']) {
    assert.ok(resourceSkeleton.includes(`'${variant}'`), `missing ${variant} resource skeleton`)
  }
  assert.match(resourceSkeleton, /data-resource-skeleton=/)
  assert.match(resourceSkeleton, /data-resource-skeleton-variant=/)
  assert.match(resourceSkeleton, /role="status"/)
  assert.match(resourceSkeleton, /aria-label=\{label\}/)
  assert.match(resourceSkeleton, /Math\.max\(1, Math\.min\(count, 8\)\)/)
})

test('global resource surfaces render Skeletons instead of plain initial loading text', () => {
  const surfaces = [
    '../desktop/PersonalDashboard.tsx',
    '../features/documents/components/DocumentsView.tsx',
    '../features/calendar/components/CalendarView.tsx',
    '../features/calendar/components/CalendarEventPeekContent.tsx',
    '../components/WorkspaceChrome.tsx',
    '../components/WorkspacePicker.tsx',
    '../components/AttachmentViewer.tsx',
    '../features/documents/components/DocumentEditor.tsx',
    '../features/learning/dashboard/LearningDashboardPanel.tsx',
    '../features/learning/dashboard/TeacherLearnersSection.tsx',
    '../features/learning/dashboard/CourseMembersSection.tsx',
    '../features/learning/dashboard/CourseSettingsSection.tsx',
    '../features/knowledge/components/PersonalSourceDrive.tsx',
    '../features/knowledge/components/ProjectSourceLibrary.tsx',
    '../components/LinkPreview.tsx',
  ]
  for (const path of surfaces) {
    const source = read(path)
    assert.match(source, /<(?:ResourceSkeleton|Skeleton|PeekLoading)\b/, `${path} has no Skeleton pending branch`)
  }
  for (const path of [
    '../desktop/PersonalDashboard.tsx',
    '../features/learning/dashboard/LearningDashboardPanel.tsx',
    '../features/learning/dashboard/TeacherLearnersSection.tsx',
    '../features/learning/dashboard/CourseMembersSection.tsx',
    '../features/learning/dashboard/CourseSettingsSection.tsx',
  ]) assert.match(read(path), /<(?:ResourceSkeleton|Skeleton)\b/, `${path} has no accessible busy resource`)
  assert.match(read('../desktop/PersonalDashboard.tsx'), /pagePending[\s\S]*正在加载学习看板/)
  assert.match(read('../features/calendar/components/CalendarView.tsx'), /!loaded \?[\s\S]*正在加载日历/)
  assert.match(read('../components/LinkPreview.tsx'), /if \(!loaded\) return <ResourceSkeleton/)
  assert.doesNotMatch(read('../components/LinkPreview.tsx'), /render NOTHING \(no skeleton\)/)
  const linkPreview = read('../components/LinkPreview.tsx')
  assert.match(linkPreview, /messagesApi\.getLinkPreview/)
  assert.match(linkPreview, /role="alert"/)
  assert.match(linkPreview, /链接预览加载失败/)
  assert.match(linkPreview, /setRetryRevision/)
  assert.doesNotMatch(linkPreview, /@\/api\/core\/http/)
})

test('confidence citations open the shared source Drawer with an exact highlighted passage', () => {
  const desktop = read('../desktop/DesktopApp.tsx')
  const markdown = read('../components/assistant-ui/markdown-text.tsx')
  const sources = read('../components/WorkspaceChrome.tsx')
  const state = read('../features/knowledge/state.ts')
  assert.match(desktop, /<SourceDetailOverlay \/>/)
  assert.match(markdown, /openCitation\(evidence\[0\]!\)/)
  assert.match(sources, /detailLoading && !selectedSource[\s\S]*ResourceSkeleton variant="detail"/)
  assert.match(sources, /sourceText\.indexOf\(selectedCitation\.excerpt\)/)
  assert.match(sources, /<mark ref=\{citationMark\}[\s\S]*bg-emerald-500\/20/)
  assert.match(state, /selectedCitation: citation, detailLoading: !cached/)
})

test('repository skill requires Skeletons for all future asynchronous resources', () => {
  assert.match(resourceSkill, /name: lingxiloop-resource-loading/)
  assert.match(resourceSkill, /any LingxiLoop resource UI, page-like destination, or focused creation\/editing flow/)
  assert.match(resourceSkill, /established page, Drawer, or Dialog host/)
  assert.match(resourceSkill, /Dashboard page for top-level browsing and management destinations/)
  assert.match(resourceSkill, /Never render developer-facing annotations/)
  assert.match(resourceSkill, /temporary debug copy as prohibited production UI/)
  assert.match(resourceSkill, /Creating a group chat is a required Dialog use case/)
  assert.match(resourceSkill, /Do not turn every destination or overlay into a Drawer/)
  assert.match(resourceSkill, /Choose Page, Drawer, Dialog, or Alert Dialog by intent/)
  assert.match(resourceSkill, /Treat a resource loading state as part of the feature contract/)
  assert.match(resourceSkill, /Do not return `null`, plain “加载中…” text, a spinner alone/)
  assert.match(resourceSkill, /Web, Electron, peek\/sheet\/dialog/)
  assert.match(resourceSkill, /\$lingxiloop-verify-change/)
})
