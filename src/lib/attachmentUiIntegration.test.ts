import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('attachment upload and loading surfaces share the preset shadcn primitives', () => {
  const preset = JSON.parse(read('../../components.json')) as { style: string; tailwind: { baseColor: string }; iconLibrary: string }
  assert.deepEqual(
    { style: preset.style, baseColor: preset.tailwind.baseColor, iconLibrary: preset.iconLibrary },
    { style: 'base-luma', baseColor: 'mist', iconLibrary: 'hugeicons' },
  )

  for (const path of [
    '../features/chat/components/ConversationComposer.tsx',
    '../features/email/components/EmailComposer.tsx',
    '../components/WorkspaceChrome.tsx',
  ]) {
    const source = read(path)
    assert.match(source, /<Attachment/)
    assert.match(source, /(?:uploading|processing)/)
  }

  const composer = read('../features/chat/components/ConversationComposer.tsx')
  assert.doesNotMatch(composer, /border-\[#e5e5e5\]|bg-white|dark:bg-\[#2a2a2a\]/)
  const message = read('../features/chat/components/ConversationMessage.tsx')
  assert.match(message, /<MessageAttachments/)
  assert.doesNotMatch(message, /@\/components\/ui\/attachment/)
  assert.match(read('../components/AttachmentViewer.tsx'), /<Empty[\s\S]*无法显示预览/)
  const drive = read('../features/knowledge/components/PersonalSourceDrive.tsx')
  const library = read('../features/knowledge/components/ProjectSourceLibrary.tsx')
  assert.match(drive, /<Card[\s\S]*<ContextMenu/)
  assert.match(library, /<Card[\s\S]*<ContextMenu/)
})

test('file selection closes the shared upload dialog and reveals background progress in the source list', () => {
  const dashboard = read('../features/knowledge/components/ProjectSourceLibrary.tsx')
  const conversation = read('../components/WorkspaceChrome.tsx')
  const dialog = read('../features/knowledge/components/KnowledgeSourceUploadDialog.tsx')
  const state = read('../features/knowledge/state.ts')
  const api = read('../features/knowledge/api.ts')

  assert.match(dashboard, /<KnowledgeSourceUploadDialog/)
  assert.match(conversation, /<KnowledgeSourceUploadDialog/)
  assert.doesNotMatch(conversation, /addFiles/)
  assert.doesNotMatch(state, /addFiles/)
  assert.match(dialog, /DialogContent className="h-\[min\(32rem,calc\(100dvh-2rem\)\)\] grid-rows-/)
  assert.match(dialog, /<Tabs[\s\S]*className="min-h-0"/)
  assert.match(dialog, /reset\(\)[\s\S]*onOpenChange\(false\)[\s\S]*void onFiles\(allowed\)/)
  assert.doesNotMatch(dialog, /uploadingFiles|<Attachment/)
  assert.match(api, /onPending\?\.\(\)/)
  assert.match(dashboard, /uploadProjectSource\(projectId, file, revealPending\)/)
  assert.match(conversation, /uploadKnowledgeFile\(conversationId, file, revealPending\)/)
  assert.match(state, /item\.status === 'upload_pending'[\s\S]*item\.status === 'queued'/)
})
