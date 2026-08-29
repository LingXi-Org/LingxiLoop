import type { ClipboardEvent, KeyboardEvent, RefObject } from 'react'
import { RichInput, type MentionInfo, type RichInputHandle } from '@/components/RichInput'
import {
  ComposerCommandMenu,
  ComposerMentionMenu,
  type ComposerCommand,
  type MentionEntry,
} from './ComposerMenus'

export function ComposerEditor({
  editorRef,
  draft,
  placeholder,
  onChange,
  onKeyDown,
  onPaste,
  onBlur,
  resolveMention,
  mention,
  mentionEntries,
  mentionIndex,
  onMentionHover,
  onMentionPick,
  commandOpen,
  commandQuery,
  commands,
  commandIndex,
  onCommandHover,
  onCommandPick,
}: {
  editorRef: RefObject<RichInputHandle | null>
  draft: string
  placeholder: string
  onChange: (value: string, caret: number) => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onPaste: (event: ClipboardEvent<HTMLDivElement>) => void
  onBlur: () => void
  resolveMention: (id: string) => MentionInfo | null
  mention: { query: string } | null
  mentionEntries: MentionEntry[]
  mentionIndex: number
  onMentionHover: (index: number) => void
  onMentionPick: (entry: MentionEntry) => void
  commandOpen: boolean
  commandQuery: string
  commands: ComposerCommand[]
  commandIndex: number
  onCommandHover: (index: number) => void
  onCommandPick: (command: ComposerCommand) => void
}) {
  return (
    <div className="relative">
      <RichInput
        ref={editorRef}
        defaultValue={draft}
        placeholder={placeholder}
        ariaLabel="消息输入框"
        className="rich-input w-full whitespace-pre-wrap bg-transparent text-[14px] leading-[1.5] text-ink-900"
        style={{ minHeight: '1.5em' }}
        maxHeight={200}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={onBlur}
        resolveMention={resolveMention}
      />
      {commandOpen && (
        <ComposerCommandMenu query={commandQuery} commands={commands} activeIndex={commandIndex} onHover={onCommandHover} onPick={onCommandPick} />
      )}
      {mention && (
        <ComposerMentionMenu query={mention.query} entries={mentionEntries} activeIndex={mentionIndex} onHover={onMentionHover} onPick={onMentionPick} />
      )}
    </div>
  )
}
