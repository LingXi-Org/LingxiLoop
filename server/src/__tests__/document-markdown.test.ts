import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import {
  markdownToProseMirrorContent,
  markdownToYXml,
  parseInlineMarkdown,
} from '../modules/documents/markdown.js'

test('parseInlineMarkdown converts common marks', () => {
  assert.deepEqual(parseInlineMarkdown('Use **bold**, *italic*, ~~gone~~, `code`, and [docs](https://loop.example.com).'), [
    { type: 'text', text: 'Use ' },
    { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
    { type: 'text', text: ', ' },
    { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
    { type: 'text', text: ', ' },
    { type: 'text', text: 'gone', marks: [{ type: 'strike' }] },
    { type: 'text', text: ', ' },
    { type: 'text', text: 'code', marks: [{ type: 'code' }] },
    { type: 'text', text: ', and ' },
    { type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: 'https://loop.example.com' } }] },
    { type: 'text', text: '.' },
  ])
})

test('parseInlineMarkdown does not turn image markdown into a normal link', () => {
  assert.deepEqual(parseInlineMarkdown('![Sketch](https://cdn.example.com/sketch.png)'), [
    { type: 'text', text: '![Sketch](https://cdn.example.com/sketch.png)' },
  ])
})

test('markdownToProseMirrorContent converts block markdown', () => {
  assert.deepEqual(markdownToProseMirrorContent([
    '# Plan',
    '',
    'Intro with **weight**.',
    '',
    '- First',
    '- Second',
    '',
    '![Launch mood](https://cdn.example.com/launch.png "Hero sketch")',
    '',
    '> quoted',
    '',
    '```ts',
    'const ok = true',
    '```',
  ].join('\n')), [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Plan' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Intro with ' },
        { type: 'text', text: 'weight', marks: [{ type: 'bold' }] },
        { type: 'text', text: '.' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }] },
      ],
    },
    {
      type: 'image',
      attrs: {
        src: 'https://cdn.example.com/launch.png',
        alt: 'Launch mood',
        title: 'Hero sketch',
      },
    },
    {
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quoted' }] }],
    },
    {
      type: 'codeBlock',
      attrs: { language: 'ts' },
      content: [{ type: 'text', text: 'const ok = true' }],
    },
  ])
})

test('markdownToProseMirrorContent leaves unsafe image URLs as text', () => {
  assert.deepEqual(markdownToProseMirrorContent('![bad](javascript:alert(1))'), [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: '![bad](javascript:alert(1))' }],
    },
  ])
})

test('markdownToYXml emits ProseMirror-compatible Yjs nodes', () => {
  const doc = new Y.Doc()
  const fragment = doc.getXmlFragment('default')
  fragment.push(markdownToYXml('## Done\n\n![Sketch](/uploads/sketch.png)\n\n1. Ship **this**'))

  assert.deepEqual(yXmlFragmentToProsemirrorJSON(fragment as unknown as Parameters<typeof yXmlFragmentToProsemirrorJSON>[0]), {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Done' }],
      },
      {
        type: 'image',
        attrs: {
          src: '/uploads/sketch.png',
          alt: 'Sketch',
        },
      },
      {
        type: 'orderedList',
        attrs: { start: 1 },
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Ship ' },
                  { type: 'text', text: 'this', marks: [{ type: 'bold', attrs: {} }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  })
})

test('markdownToProseMirrorContent parses a GFM table', () => {
  const md = '| 用途 | 值 |\n|---|---|\n| 背景 | `#F4F1EA` |\n| 文字 | **深绿** |'
  assert.deepEqual(markdownToProseMirrorContent(md), [
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '用途' }] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '值' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '背景' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '#F4F1EA', marks: [{ type: 'code' }] }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '文字' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '深绿', marks: [{ type: 'bold' }] }] }] },
          ],
        },
      ],
    },
  ])
})

test('table with escaped pipes and ragged rows normalizes to header width', () => {
  const md = '| a | b |\n|:--|--:|\n| x \\| y | 1 | extra |\n| only |'
  const [table] = markdownToProseMirrorContent(md) as Array<{ type: string; content: Array<{ content: unknown[] }> }>
  assert.equal(table.type, 'table')
  assert.equal(table.content.length, 3)
  for (const row of table.content) assert.equal(row.content.length, 2)
})

test('a pipe line without a separator stays a paragraph and does not hang', () => {
  const nodes = markdownToProseMirrorContent('| not a table |\nplain text')
  assert.deepEqual(nodes[0], { type: 'paragraph', content: [{ type: 'text', text: '| not a table |' }] })
  assert.deepEqual(nodes[1], { type: 'paragraph', content: [{ type: 'text', text: 'plain text' }] })
})
