import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const skeleton = read('../components/ui/skeleton.tsx')
const resourceSkeleton = read('../components/ResourceSkeleton.tsx')
const resourceSkill = read('../../.agents/skills/lingxiloop-resource-loading/SKILL.md')

test('Skeleton remains byte-shaped like the official base-nova primitive', () => {
  assert.match(skeleton, /data-slot="skeleton"/)
  assert.match(skeleton, /animate-pulse rounded-md bg-muted/)
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
    '../features/documents/components/DocumentsView.tsx',
    '../features/boards/components/BoardsView.tsx',
    '../features/calendar/components/CalendarView.tsx',
    '../features/calendar/components/CalendarEventPeekContent.tsx',
    '../components/WorkspaceChrome.tsx',
    '../components/WorkspacePicker.tsx',
    '../features/boards/components/BoardPeekContent.tsx',
    '../components/AttachmentViewer.tsx',
    '../features/documents/components/DocumentEditor.tsx',
    '../features/learning/components/LearningCenter.tsx',
    '../components/LinkPreview.tsx',
    '../components/messages/MessageBusinessParts.tsx',
    '../admin/UsersPage.tsx',
    '../admin/WaitlistPage.tsx',
  ]
  for (const path of surfaces) {
    const source = read(path)
    assert.match(source, /<(?:ResourceSkeleton|Skeleton|PeekLoading)\b/, `${path} has no Skeleton pending branch`)
  }
  assert.match(read('../components/LinkPreview.tsx'), /if \(!loaded\) return <ResourceSkeleton/)
  assert.doesNotMatch(read('../components/LinkPreview.tsx'), /render NOTHING \(no skeleton\)/)
})

test('repository skill requires Skeletons for all future asynchronous resources', () => {
  assert.match(resourceSkill, /name: lingxiloop-resource-loading/)
  assert.match(resourceSkill, /any LingxiLoop resource UI, page-like destination, or focused creation\/editing flow/)
  assert.match(resourceSkill, /shared shadcn `Drawer`/)
  assert.match(resourceSkill, /permanently limited to two columns/)
  assert.match(resourceSkill, /Never render developer-facing annotations/)
  assert.match(resourceSkill, /temporary debug copy as prohibited production UI/)
  assert.match(resourceSkill, /Creating a group chat is a required Dialog use case/)
  assert.match(resourceSkill, /Do not turn every overlay into a Drawer/)
  assert.match(resourceSkill, /Choose Drawer, Dialog, or Alert Dialog by intent/)
  assert.match(resourceSkill, /Treat a resource loading state as part of the feature contract/)
  assert.match(resourceSkill, /Do not return `null`, plain “加载中…” text, a spinner alone/)
  assert.match(resourceSkill, /Web, Electron, peek\/sheet\/dialog/)
  assert.match(resourceSkill, /\$lingxiloop-verify-change/)
})
