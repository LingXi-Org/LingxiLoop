import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import { usableDocument, type ContentDocument } from './document'
import type { ContentBlock } from './schema'

function plainParagraph(block: ContentBlock): string | undefined {
  if (block.type !== 'paragraph' || block.children.length || block.content.some(part => part.type !== 'text' || Object.keys(part.styles).length)) return
  if (Object.entries(block.props).some(([key, value]) => value !== (key === 'textAlignment' ? 'left' : 'default'))) return
  return block.content.map(part => part.type === 'text' ? part.text : '').join('')
}

/** Recover only paragraphs that exactly reproduce a complete fence in the current
 * authoritative Markdown. Escaped prose and stale legacyMarkdown never opt in.
 * Existing Markdown and BlockNote parsers own the semantics and native import. */
export function recoverFencedCode(document: ContentDocument, markdown: string, importCode: (source: string) => ContentBlock[]): ContentDocument {
  if (!usableDocument(document, markdown)) return document
  const tree = fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
  let blocks = document.blocks
  for (const node of tree.children) {
    if (node.type !== 'code' || node.position?.start.offset === undefined || node.position.end.offset === undefined) continue
    const source = markdown.slice(node.position.start.offset, node.position.end.offset).replace(/\r\n?/g, '\n')
    const lines = source.split('\n')
    // The AST also accepts indented and unclosed code. Historical repair requires
    // an explicit closing fence; normal Markdown imports retain CommonMark behavior.
    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(lines[0])?.[1]
    const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lines.at(-1) ?? '')?.[1]
    if (lines.length < 2 || !opening || !closing || closing[0] !== opening[0] || closing.length < opening.length) continue
    // Duplicate native/source matches cannot establish which literal paragraph
    // was intended as code. Leave those for explicit, reviewed conversion.
    if (blocks.some(block => block.type === 'codeBlock' && block.content.map(part => part.type === 'text' ? part.text : '').join('') === node.value)) continue
    const matches: { start: number; end: number }[] = []
    for (let start = 0; start < blocks.length; start++) {
      const parts: string[] = []
      for (let end = start; end < blocks.length; end++) {
        const text = plainParagraph(blocks[end])
        if (text === undefined) break
        parts.push(text.replace(/\r\n?/g, '\n'))
        if (parts.join('\n') === source || parts.join('\n\n') === source) {
          matches.push({ start, end })
          break
        }
        if (parts.join('\n').length >= source.length || (parts.length === 1 && !source.startsWith(parts[0]))) break
      }
    }
    if (matches.length !== 1) continue
    const { start, end } = matches[0]
    const parsed = importCode(source)
    const code = parsed[0]
    if (parsed.length !== 1 || code.type !== 'codeBlock' || code.content.some(part => part.type !== 'text') || code.content.map(part => part.type === 'text' ? part.text : '').join('') !== node.value) continue
    blocks = [...blocks.slice(0, start), { ...code, id: blocks[start].id }, ...blocks.slice(end + 1)]
  }
  return blocks === document.blocks ? document : { ...document, blocks }
}
