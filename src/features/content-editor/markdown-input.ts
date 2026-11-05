import { createExtension } from '@blocknote/core'
import { SourceBlockWithPreviewExtension } from '@blocknote/core/extensions'
import { codeLanguage } from './code-block'

/** Upstream handles a trailing space; Markdown authors also finish fences with Enter. */
export const markdownInput = createExtension({
  key: 'content-markdown-input',
  keyboardShortcuts: {
    Enter: ({ editor, event }) => {
      if (event.isComposing) return false
      return editor.transact(tr => {
        const { block } = editor.getTextCursorPosition()
        const { empty, $from } = tr.selection
        if (block.type !== 'paragraph' || !empty || $from.parentOffset !== $from.parent.content.size) return false
        const source = $from.parent.textContent
        const fence = /^(?:`{3,}|~{3,})([\w+-]*)[ \t]*$/.exec(source)
        if (!fence && !/^(?:\$\$|\\\[)[ \t]*$/.test(source)) return false
        editor.updateBlock(block, fence
          ? { type: 'codeBlock', props: { language: codeLanguage(fence[1]) }, content: [] }
          : { type: 'mathBlock', props: {}, content: [] })
        editor.setTextCursorPosition(block, 'start')
        if (!fence) editor.getExtension(SourceBlockWithPreviewExtension)?.store.setState(state => ({ ...state, popupOpen: block.id }))
        return true
      })
    },
  },
})
