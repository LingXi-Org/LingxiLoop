import { BlockNoteSchema, type Block, type BlockNoteEditor } from '@blocknote/core'
import { contentCodeBlock } from './code-block'
import { createReactMathBlockSpec, createReactInlineMathSpec, locales as mathLocales } from '@blocknote/math-block'
import { createReactDiagramBlockSpec, locales as diagramLocales } from '@blocknote/diagram-block'
import { zh } from '@blocknote/core/locales'

// Upstream's complete default schema, plus its official free math/diagram/code
// implementations to retain the forum's existing formulas, Mermaid and code.
export const contentSchema = BlockNoteSchema.create().extend({
  blockSpecs: { codeBlock: contentCodeBlock, mathBlock: createReactMathBlockSpec(), diagram: createReactDiagramBlockSpec() },
  inlineContentSpecs: { math: createReactInlineMathSpec() },
})
export const contentDictionary = { ...zh, math: mathLocales.zh, diagram: diagramLocales.zh }
export type ContentBlock = Block<typeof contentSchema.blockSchema, typeof contentSchema.inlineContentSchema, typeof contentSchema.styleSchema>
export type NativeEditor = BlockNoteEditor<typeof contentSchema.blockSchema, typeof contentSchema.inlineContentSchema, typeof contentSchema.styleSchema>
