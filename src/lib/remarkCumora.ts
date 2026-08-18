/**
 * remark plugin: Cumora's custom inline tokens on top of standard Markdown.
 *
 * react-markdown + remark-gfm parse the STANDARD grammar (headings, lists,
 * blockquotes, tables, emphasis, code, autolinks). This plugin layers on the
 * Cumora-specific tokens that no Markdown engine knows about, so they keep
 * rendering as their rich components:
 *   - `@<id>`                     → mention chip (avatar + hovercard)
 *   - `doc_… / board-… / card-… / ce-…` → live artifact link cards
 *   - unicode emoji               → Twemoji
 *   - Skype `(shortcode)`         → animated Skype emoji
 *
 * It runs `parseBody` (the single source of truth for Cumora tokenization) on
 * every remaining text node and splits matches into custom mdast nodes carrying
 * a `data.hName` so mdast→hast emits a custom element that react-markdown maps
 * to the matching component (see `cumoraMarkdownComponents` in Message.tsx).
 *
 * Text nodes only reach here AFTER remark has consumed the standard markers
 * (bold/italic/code/links), so in practice parseBody only finds the four custom
 * kinds — but we map every kind it can emit, defensively.
 */
import { visit, SKIP } from 'unist-util-visit'
import type { Root, RootContent, Text } from 'mdast'
import { parseBody, type RichToken } from './utils'

/** A custom mdast node that mdast-util-to-hast renders as `<hName …>` because of
 *  `data.hName` / `data.hProperties`. react-markdown then routes it to our
 *  component by tag name. */
function customEl(hName: string, hProperties: Record<string, string>): RootContent {
  return {
    type: 'cumora',
    data: { hName, hProperties },
    children: [],
  } as unknown as RootContent
}

function tokenToNode(t: RichToken): RootContent {
  switch (t.kind) {
    case 'mention': return customEl('cmention', { cid: t.id })
    case 'msgref': return customEl('cmsgref', { cn: String(t.n) })
    case 'document': return customEl('cartifact', { ckind: 'document', cid: t.id })
    case 'board': return customEl('cartifact', { ckind: 'board', cid: t.id })
    case 'card': return customEl('cartifact', { ckind: 'card', cid: t.id })
    case 'calendar': return customEl('cartifact', { ckind: 'calendar', cid: t.id })
    case 'emoji': return customEl('cemoji', { cchar: t.value })
    case 'skype': return customEl('cskype', { cname: t.name })
    // The standard kinds below are normally handled by remark itself; we map
    // them too so a stray literal marker in a text node still renders right.
    case 'bold': return { type: 'strong', children: [{ type: 'text', value: t.value }] } as RootContent
    case 'code': return { type: 'inlineCode', value: t.value } as RootContent
    case 'link': return { type: 'link', url: t.url, children: [{ type: 'text', value: t.text }] } as RootContent
    default: return { type: 'text', value: t.value } as RootContent
  }
}

export function remarkCumora() {
  return (tree: Root): void => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || typeof index !== 'number') return
      const tokens = parseBody(node.value)
      // Nothing Cumora-specific in this text node — leave it untouched.
      if (tokens.length === 1 && tokens[0].kind === 'text') return
      const replacement = tokens.map(tokenToNode)
      parent.children.splice(index, 1, ...replacement)
      // Skip past the nodes we just inserted so we don't re-visit them.
      return [SKIP, index + replacement.length]
    })
  }
}
