import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { renderToReadableStream } from 'react-dom/server'
import { load } from 'cheerio'
mock.module('./DeckNav', { namedExports: { DeckNav: () => <nav>文稿</nav> } })
const { SlidesSidebarLayout } = await import('./SlidesSidebarLayout')
const { PageHeader } = await import('./PageHeader')
test('Slides enters collapsed on its first render, with a reachable native trigger', async () => {
  const stream = await renderToReadableStream(<SlidesSidebarLayout><PageHeader title="演示文稿" /></SlidesSidebarLayout>)
  await stream.allReady
  const $ = load(await new Response(stream).text())
  assert.equal($('[data-slot=sidebar][data-side=left]').attr('data-state'), 'collapsed')
  assert.equal($('[data-slot=sidebar][data-side=left]').attr('data-collapsible'), 'offcanvas')
  assert.equal($('[data-slot=sidebar-container][inert]').length, 1)
  assert.equal($('[data-page-header] [data-slot=sidebar-trigger]').attr('aria-expanded'), 'false')
  assert.equal($('[data-page-header] [data-slot=sidebar-trigger]').attr('aria-label'), '展开或收起演示文稿导航')
})
