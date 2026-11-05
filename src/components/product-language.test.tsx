import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Calendar } from './ui/calendar'
import { FileViewerLoadingState, FileViewerUnsupportedState } from './retab/ui/file-viewer-state'
import { formatViewerControlPosition } from './retab/ui/viewer-controls'
import { ResourceError, ViewerFormatError, toViewerErrorInfo } from './retab/lib/viewer-errors'
import { describeDiagram } from './retab/ui/mermaid-renderer'

test('calendar defaults to Chinese dates and accessibility labels independently of browser locale', () => {
  const day = new Date(2026, 10, 5)
  const html = renderToStaticMarkup(<Calendar mode="single" month={day} selected={day} today={day} />)
  assert.match(html, /2026年11月|2026年 11月|2026年十一月|2026年 十一月/)
  assert.match(html, /前往下个月/)
  assert.match(html, /今天/)
  assert.match(html, /已选择/)
  assert.doesNotMatch(html, /Go to|Today,|, selected|November/)
})

test('file preview defaults are Chinese while authored filenames and custom labels stay intact', () => {
  const html = renderToStaticMarkup(<><FileViewerLoadingState /><FileViewerUnsupportedState fileName="Original notes.md" /></>)
  assert.match(html, /正在加载文件/)
  assert.match(html, /暂时无法预览/)
  assert.match(html, /Original notes.md/)
  assert.equal(formatViewerControlPosition({kind:'page',current:2,total:10}), '第 2 页，共 10 页')
  assert.equal(formatViewerControlPosition({kind:'slide',current:3}), '第 3 张')
  assert.equal(formatViewerControlPosition({label:'Author label'}), 'Author label')
})

test('preview error fallbacks and generated diagram descriptions are Chinese', () => {
  assert.match(toViewerErrorInfo(new ResourceError({kind:'fetch_failed',message:'private diagnostic'})).userMessage, /无法加载文件/)
  assert.match(toViewerErrorInfo(new ViewerFormatError({format:'pdf',kind:'parse_failed',message:'private diagnostic'})).userMessage, /PDF/)
  assert.doesNotMatch(toViewerErrorInfo(Error('private diagnostic')).userMessage, /private diagnostic/)
  assert.match(describeDiagram('graph LR\nA-->B'), /从左到右.*节点.*条边/)
  assert.match(describeDiagram('sequenceDiagram\nA->>B: hello'), /参与者.*消息/)
})
