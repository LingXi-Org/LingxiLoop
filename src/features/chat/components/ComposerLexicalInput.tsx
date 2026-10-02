import {
  unstable_useTriggerPopoverRootContextOptional,
  useAuiState,
} from '@assistant-ui/react'
import { LexicalComposerInput } from '@assistant-ui/react-lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ENTER_COMMAND,
  type RangeSelection,
} from 'lexical'
import { useEffect, useImperativeHandle, useRef, type ComponentProps, type Ref } from 'react'
import { ComposerDirectiveChip } from './ComposerTriggers'
import { chatLatency } from '../runtime/latency'

function ComposerReadyPlugin({ conversationId }: { conversationId: string }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    let cancel: (() => void) | undefined
    const ready = () => {
      cancel?.()
      const node = editor.getRootElement()
      if (node && editor.isEditable()) cancel = chatLatency.ready(conversationId, 'composer_ready', node)
    }
    const root = editor.registerRootListener(ready)
    const editable = editor.registerEditableListener(ready)
    return () => { root(); editable(); cancel?.() }
  }, [conversationId, editor])
  return null
}

function ConcurrentSubmitPlugin() {
  const [editor] = useLexicalComposerContext()
  const triggerRoot = unstable_useTriggerPopoverRootContextOptional()
  const canSend = useAuiState((state) => state.composer.canSend)
  useEffect(() => editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
    if (!event || event.isComposing || event.shiftKey || event.ctrlKey || event.metaKey) return false
    if (triggerRoot?.getActiveAria()) return false
    if (!canSend) return false
    event.preventDefault()
    editor.getRootElement()?.closest('form')?.requestSubmit()
    return true
  }, COMMAND_PRIORITY_CRITICAL), [canSend, editor, triggerRoot])
  return null
}

function MentionTriggerPlugin({ insertMentionRef }: { insertMentionRef: Ref<() => void> }) {
  const [editor] = useLexicalComposerContext()
  const savedSelection = useRef<RangeSelection | null>(null)
  useEffect(() => editor.registerUpdateListener(({ editorState }) => {
    editorState.read(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) savedSelection.current = selection.clone()
    })
  }), [editor])
  useImperativeHandle(insertMentionRef, () => () => {
    if (!editor.isEditable()) return
    editor.update(() => {
      const previous = $getSelection() ?? savedSelection.current?.clone()
      const selection = $isRangeSelection(previous) && $getNodeByKey(previous.anchor.key) && $getNodeByKey(previous.focus.key)
        ? previous : $getRoot().selectEnd()
      // Toolbar focus must not replace selected draft text or rebuild existing chips.
      selection.anchor.set(selection.focus.key, selection.focus.offset, selection.focus.type)
      $setSelection(selection)
      const node = selection.anchor.getNode()
      const before = $isTextNode(node)
        ? node.getTextContent().slice(0, selection.anchor.offset) || node.getPreviousSibling()?.getTextContent() || ''
        : $isElementNode(node) ? node.getChildAtIndex(selection.anchor.offset - 1)?.getTextContent() ?? '' : ''
      selection.insertText(/\S$/.test(before) ? ' @' : '@')
    })
  }, [editor])
  return null
}

export function ComposerLexicalInput({ conversationId, insertMentionRef, ...props }: Omit<ComponentProps<typeof LexicalComposerInput>, 'directiveChip'> & { conversationId: string; insertMentionRef: Ref<() => void> }) {
  return (
    <LexicalComposerInput {...props} directiveChip={ComposerDirectiveChip}>
      <ConcurrentSubmitPlugin />
      <ComposerReadyPlugin conversationId={conversationId} />
      <MentionTriggerPlugin insertMentionRef={insertMentionRef} />
    </LexicalComposerInput>
  )
}
