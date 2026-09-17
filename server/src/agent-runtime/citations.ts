import type { EvidenceItem } from '@lyyzka/lingxios'
import { markdownToProseMirrorContent, type ProseMirrorJsonMark, type ProseMirrorJsonNode } from '../modules/documents/markdown.js'

const normalizeLabel = (text: string) => text.replace(/[\s《》〈〉【】[\](),，:：;；。.!！?？]/g, '').toLowerCase()
const correction = 'Cite the supported answer wording itself: [supported answer wording](#cite-S1). Do not use source numbers, 【Sx】, source titles or generic source labels as the link text. Keep surrounding Markdown and cite only relevant recorded evidence.'

export function citationTextViolation(text: string, evidence: readonly EvidenceItem[]): string | null {
  const labels = new Map<ProseMirrorJsonMark, string>()
  let prose = ''
  const visit = (nodes: ProseMirrorJsonNode[]) => {
    for (const node of nodes) {
      if (node.type === 'codeBlock') { prose += '\n'; continue }
      if ('text' in node) {
        const link = node.marks?.find(mark => mark.type === 'link' && String(mark.attrs?.href).startsWith('#cite-'))
        if (link) { labels.set(link, (labels.get(link) ?? '') + node.text); prose += '\0' }
        else prose += node.marks?.some(mark => mark.type === 'code') ? '\0' : node.text
      } else if (node.content) { visit(node.content); prose += '\n' }
    }
  }
  visit(markdownToProseMirrorContent(text))
  if (/【S\d+(?:[,，]S\d+)*】|\[S\d+(?:,S\d+)*\]/i.test(prose)) return correction
  for (const [link, text] of labels) {
    const label = normalizeLabel(text), markers = String(link.attrs?.href).slice('#cite-'.length).split(',')
    if (!label || /^(?:s?\d+)+$/i.test(label)
      || /^(?:来源|参考资料?|引文|引用|原文|source|citation|ref(?:erence)?)(?:s?\d+)?$/i.test(label)
      || evidence.some(item => markers.includes(item.marker)
        && [item.title, item.sourceId, item.url].some(value => value && normalizeLabel(value) === label))) return correction
  }
  return null
}
