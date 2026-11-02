import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { renderToReadableStream } from 'react-dom/server'
import type { ReactNode } from 'react'
import { load } from 'cheerio'
import type { SlideEditorContext } from '../../../shared/slides-editor-context'

mock.module('@/features/artifacts/components/ArtifactEditorFrame', { namedExports: {
  ArtifactEditorFrame: ({ artifactId }: { artifactId: string }) => <iframe title="演示文稿编辑器" data-editor={artifactId} />,
} })
mock.module('@/features/artifacts/api', { namedExports: { artifactsApi: {} } })
mock.module('@/stores/app', { namedExports: { useApp: { getState: () => ({ selectConversation() {} }) } } })
const { ArtifactSurface, ArtifactSurfaceProvider } = await import('./artifact-surface')
async function render(node: ReactNode) {
  const stream = await renderToReadableStream(node)
  await stream.allReady
  return load(await new Response(stream).text())
}
function surface(context: SlideEditorContext | null) {
  return <ArtifactSurfaceProvider initial={{ id: 'legacy-deck', title: '旧稿', sourceConversationId: 'original-chat' }} onClose={() => {}}>
    <ArtifactSurface context={context} onEditorContext={() => {}} agentWorking={false} />
  </ArtifactSurfaceProvider>
}
test('a deck opens alongside chat and keeps its source and recovery actions', async () => {
  const $ = await render(surface(null))
  assert.equal($('aside[aria-label="演示文稿：旧稿"]').length, 1)
  assert.equal($('.fixed, [role="dialog"], [aria-modal="true"]').length, 0)
  assert.equal($('[data-editor="legacy-deck"]').length, 1)
  for (const label of ['版本记录', '打开来源对话', '返回演示文稿列表']) assert.equal($(`button[aria-label="${label}"]`).length, 1)
})
test('only a presentation context expands the surface and offers an exit', async () => {
  const $ = await render(surface({ slideId: 'one', selectedElementIds: [], selectedText: '', selection: [], selectedSlides: [],
    slideTitle: '第一页', slideIndex: 1, slideCount: 20, mode: 'present', dirty: false, version: null }))
  assert.equal($('aside.fixed').length, 1)
  assert.equal($('button').text(), '退出放映')
  assert.equal($('[data-editor="legacy-deck"]').length, 1)
})
