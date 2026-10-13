// Memos pipeline's Markdown-side stages, kept in source order (MIT). See README.md.
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { remarkDisableSetext } from './remark-disable-setext'
import { remarkSplitMixedTaskLists } from './remark-split-mixed-task-lists'
import { remarkMemoSyntax } from './remark-tag'

export const memoRemarkPlugins = [remarkDisableSetext, remarkGfm, remarkSplitMixedTaskLists, remarkMemoSyntax, remarkBreaks]
