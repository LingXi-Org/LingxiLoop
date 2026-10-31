import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { renderToReadableStream } from 'react-dom/server'
import type { ReactNode } from 'react'
import { load } from 'cheerio'

mock.module('@/features/artifacts/components/ArtifactView', { namedExports: {
  ArtifactView: ({ artifactId }: { artifactId: string }) => <iframe title="设计编辑器" data-editor={artifactId} />,
} })
const { DesignWorkspace } = await import('./DesignWorkspace')
async function render(node: ReactNode) {
  const stream = await renderToReadableStream(node)
  await stream.allReady
  return load(await new Response(stream).text())
}

test('the Canvas main view shares a nonmodal workspace with an editable conversation', async () => {
  const $ = await render(<DesignWorkspace design={{ artifactId: 'board', title: '当前画板' }} onClose={() => {}}>
    <main><p>对话正文</p><textarea aria-label="消息" /><button type="button">发送</button></main>
  </DesignWorkspace>)
  assert.equal($('aside[aria-label="设计画板：当前画板"]').length, 1)
  assert.equal($('[role="dialog"], [aria-modal="true"], [data-slot="dialog-overlay"], [data-slot="drawer-overlay"]').length, 0)
  assert.equal($('textarea[disabled], main[inert], main[aria-hidden="true"]').length, 0)
  assert.equal($('[data-editor="board"]').length, 1)
  assert.equal($('[data-design-resize-handle]').attr('aria-label'), '调整对话与画板宽度')
  assert.ok($.text().includes('对话正文'))
})

test('a closed workspace exposes the chat and no focusable Canvas surface', async () => {
  const $ = await render(<DesignWorkspace design={null} onClose={() => {}}><textarea aria-label="消息" /></DesignWorkspace>)
  assert.equal($('[data-design-workspace]').attr('data-design-open'), 'false')
  assert.equal($('[data-design-pane]').attr('aria-hidden'), 'true')
  assert.equal($('[data-design-pane][inert]').length, 1)
  assert.equal($('iframe').length, 0)
  assert.equal($('textarea').length, 1)
})
