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

export function ComposerLexicalInput(props: Omit<ComponentProps<typeof LexicalComposerInput>, 'directiveChip'>) {
  return (
    <LexicalComposerInput {...props} directiveChip={ComposerDirectiveChip}>
      <ConcurrentSubmitPlugin />
    </LexicalComposerInput>
  )
}
