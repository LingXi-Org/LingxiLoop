import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { MermaidConfig } from '@streamdown/mermaid'

test('diagram code loads only on render and preserves configuration, results and errors', async () => {
  let created = 0
  const renders: unknown[] = []
  mock.module('@streamdown/mermaid', { namedExports: {
    createMermaidPlugin: ({ config: defaults }: { config: MermaidConfig }) => {
      created++
      return { getMermaid: (config?: MermaidConfig) => ({
        async render(id: string, source: string) {
          renders.push({ id, source, config: { ...defaults, ...config } })
          if (source === 'invalid') throw new Error('invalid diagram')
          return { svg: '<svg />' }
        },
      }) }
    },
  } })
  const { mermaid } = await import('./markdown-mermaid')
  const diagram = mermaid.getMermaid({ theme: 'dark' })
  assert.equal(created, 0, 'plain messages must not initialize the diagram renderer')
  diagram.initialize({ theme: 'forest', fontFamily: 'sans-serif' })
  assert.equal(created, 0)
  assert.deepEqual(await diagram.render('one', 'graph TD; A-->B'), { svg: '<svg />' })
  assert.deepEqual(renders, [{ id: 'one', source: 'graph TD; A-->B', config: {
    securityLevel: 'strict', startOnLoad: false, theme: 'forest', fontFamily: 'sans-serif',
  } }])
  await assert.rejects(diagram.render('two', 'invalid'), /invalid diagram/)
  assert.equal(created, 1, 'reuse the installed plugin after the first render')
})
