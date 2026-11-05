import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createDocument, createNode, createPage } from '../../../../shared/artifact-document'
import { PageThumbnail } from './thumbnail'

test('thumbnail depicts node data and groups without editor, iframe or executable source', () => {
  const document = createDocument('slides', 'thumb-doc'), page = createPage('thumb-page')
  const group = { ...createNode('group', 'group'), x: 40, y: 50, rotation: 15 }
  const text = { ...createNode('text', 'text'), parentId: group.id, text: '<script>literal</script>' }
  const embed = { ...createNode('embed', 'embed'), embed: { source: '<script>alert(1)</script>', format: 'html' as const } }
  page.nodeOrder = [group.id, text.id, embed.id]; page.nodes = { group, text, embed }
  const output = renderToStaticMarkup(createElement(PageThumbnail, { page, document, loaded: true }))
  assert.match(output, /width="64" height="40"/)
  assert.match(output, /translate\(40 50\) rotate\(15/)
  assert.match(output, /&lt;script&gt;literal&lt;\/script&gt;/)
  assert.doesNotMatch(output, /<iframe|contenteditable|alert\(1\)/)
  assert.match(output, /aria-hidden="true"/)
})

test('unloaded page reuses its cached preview and immutable edits/theme changes refresh it', () => {
  const document = createDocument('slides', 'cache-doc'), page = createPage('cache-page')
  const node = { ...createNode('text', 'text'), text: 'Before', style: { themeColor: 'ink' } }
  document.themeId = 'theme'; document.themes.theme = { id: 'theme', name: 'Theme', tokens: { ink: '#123456' } }
  page.nodeOrder = [node.id]; page.nodes[node.id] = node
  const render = (value = page, loaded = true) => renderToStaticMarkup(createElement(PageThumbnail, { page: value, document, loaded }))
  assert.match(render(), /Before/)
  assert.match(render({ ...page, nodes: {}, nodeOrder: [] }, false), /Before/)
  const changed = { ...page, nodes: { text: { ...node, text: 'After' } } }
  assert.match(render(changed), /After/)
  document.themes.theme = { ...document.themes.theme, tokens: { ink: '#654321' } }
  assert.match(render(changed), /fill="#654321"/)
  assert.doesNotMatch(render({ ...page, id: 'never-loaded', nodes: {}, nodeOrder: [] }, false), /Before|After/)
})

test('thumbnail DOM remains bounded for dense pages', () => {
  const document = createDocument('design', 'dense-doc'), page = createPage('dense-page')
  const group = createNode('group', 'group'); page.nodes.group = group; page.nodeOrder.push('group')
  for (let index = 0; index < 300; index++) { const node = { ...createNode('shape', `shape-${index}`), parentId: index < 150 ? group.id : null }; page.nodes[node.id] = node; page.nodeOrder.push(node.id) }
  const output = renderToStaticMarkup(createElement(PageThumbnail, { page, document, loaded: true }))
  assert.equal((output.match(/<g /g) ?? []).length, 96)
})
