import { createCodeBlockSpec } from '@blocknote/core'
import { codeBlockOptions } from '@blocknote/code-block'
import type { NativeEditor } from './schema'

/** Use the installed language registry for every import path, including native paste. */
export function codeLanguage(language: unknown): string {
  const normalized = typeof language === 'string' ? language.trim().toLowerCase() : ''
  return Object.entries(codeBlockOptions.supportedLanguages).find(([id, spec]) =>
    id === normalized || spec.aliases.includes(normalized),
  )?.[0] ?? 'text'
}

const upstream = createCodeBlockSpec(codeBlockOptions)
export const contentCodeBlock: typeof upstream = {
  ...upstream,
  implementation: {
    ...upstream.implementation,
    parse(element) {
      const props = upstream.implementation.parse?.call(this, element)
      return props ? { ...props, language: codeLanguage(props.language) } : props
    },
    render(block, editor) {
      // Input rules and older native JSON can also contain an unsupported language.
      const rendered = upstream.implementation.render!.call(this, { ...block, props: { ...block.props, language: codeLanguage(block.props.language) } }, editor)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'content-code-copy'
      button.contentEditable = 'false'
      button.textContent = '复制'
      button.setAttribute('aria-label', '复制代码')
      const status = document.createElement('span')
      status.className = 'content-code-status'
      status.contentEditable = 'false'
      status.setAttribute('role', 'status')
      let disposed = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const copy = async () => {
        try {
          await navigator.clipboard.writeText(rendered.contentDOM?.textContent ?? '')
          if (disposed) return
          button.textContent = '已复制'; button.setAttribute('aria-label', '已复制')
          status.dataset.success = ''
          status.textContent = '代码已复制'
          clearTimeout(timer)
          timer = setTimeout(() => { button.textContent = '复制'; button.setAttribute('aria-label', '复制代码'); status.textContent = '' }, 2000)
        } catch {
          if (!disposed) { delete status.dataset.success; status.textContent = '复制失败，请选择代码后复制。' }
        }
      }
      button.addEventListener('click', copy)
      rendered.dom.append(button, status)
      rendered.dom.querySelector('select')?.setAttribute('aria-label', '代码语言')
      return { ...rendered, destroy() {
        disposed = true; clearTimeout(timer); button.removeEventListener('click', copy)
        rendered.destroy?.()
      } }
    },
  },
}

/** Keep VS Code source as text; 0.56's default handler interpolates it into HTML. */
export function pasteCode({ event, editor, defaultPasteHandler }: {
  event: ClipboardEvent; editor: NativeEditor; defaultPasteHandler: () => boolean | undefined
}) {
  const clipboard = event.clipboardData
  const metadata = clipboard?.getData('vscode-editor-data')
  if (!metadata || clipboard?.getData('blocknote/html')) return defaultPasteHandler()
  const text = clipboard?.getData('text/plain')
  if (!text) return true
  const inCode = editor.transact(tr => tr.selection.$from.parent.type.spec.code && tr.selection.$to.parent.type.spec.code)
  if (inCode) return defaultPasteHandler()
  let language: unknown
  try { language = JSON.parse(metadata)?.mode } catch { /* Malformed metadata still retains literal source. */ }
  const html = editor.blocksToFullHTML([{ type: 'codeBlock', props: { language: codeLanguage(language) }, content: text.replace(/\r\n?/g, '\n') }])
  editor.pasteHTML(html, true)
  return true
}
