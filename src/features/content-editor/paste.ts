import { pasteCode } from './code-block'
import { legacyMarkdownHtml } from './legacy'
import { hasMathSyntax } from '@/features/learning/forum/memos/math'

/** Adapt plain forum Markdown through the same parser as legacy content. Native
 * HTML, rich clipboard data and code selections retain upstream paste behavior. */
export function pasteContent(context: Parameters<typeof pasteCode>[0], format: 'forum' | 'markdown') {
  return pasteCode({ ...context, defaultPasteHandler: () => {
    const { event, editor, defaultPasteHandler } = context
    const clipboard = event.clipboardData
    if (format !== 'forum' || !clipboard || clipboard.types.includes('Files') || clipboard.getData('blocknote/html')) return defaultPasteHandler()
    const markdown = clipboard.getData('text/markdown')
    if (!markdown && clipboard.getData('text/html')) return defaultPasteHandler()
    const source = markdown || clipboard.getData('text/plain')
    if (!hasMathSyntax(source)) return defaultPasteHandler()
    const inCode = editor.transact(tr => tr.selection.$from.parent.type.spec.code && tr.selection.$to.parent.type.spec.code)
    if (inCode) return defaultPasteHandler()
    editor.pasteHTML(legacyMarkdownHtml(source, format), true)
    return true
  } })
}
