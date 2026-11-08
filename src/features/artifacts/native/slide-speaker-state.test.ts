import assert from 'node:assert/strict'
import test from 'node:test'
import { createNode, createPage } from '../../../../shared/artifact-document'
import { slideTitleSnippet, speakerPreviewPage } from './slide-speaker-state'
test('演讲者预览以实际标题文字命名，优先一级到三级标题并压缩空白', () => {
  const page = createPage('page', '文档存储标题')
  const body = { ...createNode('text', 'body'), text: '正文介绍' },
    title = {
      ...createNode('text', 'title'),
      text: '  灵犀\n\t标题  ',
      richText: {
        type: 'doc' as const,
        content: [
          {
            type: 'heading' as const,
            attrs: { level: 2 },
            content: [{ type: 'text' as const, text: '灵犀标题' }],
          },
        ],
      },
    }
  page.nodeOrder = ['body', 'title']
  page.nodes = { body, title }
  assert.equal(slideTitleSnippet(page), '灵犀 标题')
  page.nodes.title.richText = undefined
  assert.equal(slideTitleSnippet(page), '正文介绍')
  page.nodes.body.text = ''
  assert.equal(slideTitleSnippet(page), '灵犀 标题')
  page.nodes.title.text = ''
  assert.equal(slideTitleSnippet(page), '')
})
test('预览标题省略长文字时不截断字符代理对', () => {
  const page = createPage('page'),
    node = { ...createNode('text', 'title'), text: '中文😀备注' }
  page.nodeOrder = [node.id]
  page.nodes[node.id] = node
  assert.equal(slideTitleSnippet(page, 4), '中文…')
  assert.equal(slideTitleSnippet(page, 5), '中文😀…')
})

test('演讲者预览只读取已有静态快照，原始可执行文档保持不变', () => {
  const page = createPage('preview'),
    node = {
      ...createNode('embed', 'program'),
      embed: {
        format: 'html' as const,
        source: '<p>隔离内容</p>',
        sourceHash: 'a'.repeat(64),
        previewAssetId: 'snapshot',
      },
    }
  page.nodeOrder = [node.id]
  page.nodes[node.id] = node
  const preview = speakerPreviewPage(page, { snapshot: {} })
  assert.equal(preview.nodes.program.type, 'image')
  assert.equal(preview.nodes.program.assetId, 'snapshot')
  assert.equal(preview.nodes.program.embed, undefined)
  assert.equal(speakerPreviewPage(page, {}).nodes.program.hidden, true)
  assert.equal(page.nodes.program, node)
  assert.equal(page.nodes.program.type, 'embed')
})
