import {
  unstable_useTriggerPopoverRootContextOptional,
  useAuiState,
} from '@assistant-ui/react'
import { LexicalComposerInput } from '@assistant-ui/react-lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  COMMAND_PRIORITY_CRITICAL,
  KEY_ENTER_COMMAND,
} from 'lexical'
import { useEffect, type ComponentProps } from 'react'
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

export function ComposerLexicalInput({ conversationId, ...props }: Omit<ComponentProps<typeof LexicalComposerInput>, 'directiveChip'> & { conversationId: string }) {
  return (
    <LexicalComposerInput {...props} directiveChip={ComposerDirectiveChip}>
      <ConcurrentSubmitPlugin />
      <ComposerReadyPlugin conversationId={conversationId} />
    </LexicalComposerInput>
  )
}
