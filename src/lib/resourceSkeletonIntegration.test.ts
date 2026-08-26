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
    '../desktop/DocumentsView.tsx',
    '../desktop/BoardsView.tsx',
    '../desktop/CalendarView.tsx',
    '../components/WorkspaceChrome.tsx',
    '../components/WorkspacePicker.tsx',
    '../components/ArtifactPeekContent.tsx',
    '../components/AttachmentViewer.tsx',
    '../components/DocumentEditor.tsx',
    '../components/LearningCenter.tsx',
    '../components/LinkPreview.tsx',
    '../components/messages/MessageBusinessParts.tsx',
    '../mobile/MobileLibrary.tsx',
    '../mobile/MobileCalendar.tsx',
    '../admin/UsersPage.tsx',
    '../admin/WaitlistPage.tsx',
    '../admin/ObservabilityPage.tsx',
  ]
  for (const path of surfaces) {
    const source = read(path)
    assert.match(source, /<(?:ResourceSkeleton|Skeleton)\b/, `${path} has no Skeleton pending branch`)
  }
  assert.match(read('../components/LinkPreview.tsx'), /if \(!loaded\) return <ResourceSkeleton/)
  assert.doesNotMatch(read('../components/LinkPreview.tsx'), /render NOTHING \(no skeleton\)/)
})

test('repository skill requires Skeletons for all future asynchronous resources', () => {
  assert.match(resourceSkill, /name: lingxiloop-resource-loading/)
  assert.match(resourceSkill, /any LingxiLoop UI that loads resources asynchronously/)
  assert.match(resourceSkill, /Treat a resource loading state as part of the feature contract/)
  assert.match(resourceSkill, /Do not return `null`, plain “加载中…” text, a spinner alone/)
  assert.match(resourceSkill, /desktop, mobile, peek\/sheet\/dialog/)
  assert.match(resourceSkill, /\$lingxiloop-verify-change/)
})
