import { combineByGroup } from '@blocknote/core'
import { filterSuggestionItems } from '@blocknote/core/extensions'
import { BlockNoteView } from '@blocknote/mantine'
import { blockTypeSelectItems, FormattingToolbar, FormattingToolbarController, getDefaultReactSlashMenuItems, SuggestionMenuController } from '@blocknote/react'
import { getMathBlockTypeSelectItems, getMathSlashMenuItems } from '@blocknote/math-block'
import { getDiagramBlockTypeSelectItems, getDiagramSlashMenuItems } from '@blocknote/diagram-block'
import type { NativeEditor } from './schema'

/** Direct composition from upstream 0.56.0 math/diagram examples. Every item and
 * component is upstream code; false prevents duplicate default controllers only.
 * All default items and all other native controllers remain enabled. */
export function NativeView({editor,editable,theme,onChange}:{editor:NativeEditor;editable:boolean;theme:'light'|'dark';onChange?():void}) {
  return <BlockNoteView editor={editor} editable={editable} theme={theme} onChange={onChange} slashMenu={false} formattingToolbar={false}>
    <FormattingToolbarController formattingToolbar={() => <FormattingToolbar blockTypeSelectItems={[
      ...blockTypeSelectItems(editor), ...getMathBlockTypeSelectItems(editor), ...getDiagramBlockTypeSelectItems(editor),
    ]}/>}/>
    <SuggestionMenuController triggerCharacter="/" getItems={async query => filterSuggestionItems(combineByGroup(
      getDefaultReactSlashMenuItems(editor), getMathSlashMenuItems(editor), getDiagramSlashMenuItems(editor),
    ),query)}/>
  </BlockNoteView>
}
