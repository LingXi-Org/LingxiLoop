import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Calendar } from './ui/calendar'
import { FileViewerLoadingState, FileViewerUnsupportedState } from './retab/ui/file-viewer-state'
import { formatViewerControlPosition } from './retab/ui/viewer-controls'
import { ResourceError, ViewerFormatError, toViewerErrorInfo } from './retab/lib/viewer-errors'
import { describeDiagram } from './retab/ui/mermaid-renderer'
import { createMarkdownGreenfieldDocument } from './retab/ui/markdown-greenfield-document'
import { MarkdownGreenfieldChunkRenderer } from './retab/ui/markdown-greenfield-renderer'
import { XlsxGrid } from './retab/ui/xlsx-grid'

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
  assert.equal(toViewerErrorInfo(new ResourceError({kind:'http_error',status:503,message:'private diagnostic'})).userMessage, '无法加载文件（状态码 503），请稍后重试。')
  assert.match(describeDiagram('graph LR\nA-->B'), /从左到右.*节点.*条边/)
  assert.match(describeDiagram('sequenceDiagram\nA->>B: hello'), /参与者.*消息/)
})


function renderMarkdown(source: string) {
  const document = createMarkdownGreenfieldDocument(source)
  return renderToStaticMarkup(<>{document.chunks.map(chunk => <MarkdownGreenfieldChunkRenderer key={chunk.id} chunk={chunk} />)}</>)
}

test('English Markdown component protocol names still reach tabs, image and video renderers', () => {
  const html = renderMarkdown('::::tabs\n:::tab{title="第一项"}\n第一项内容\n:::\n:::tab{title="第二项"}\n第二项内容\n:::\n::::\n\n::image{src="https://example.test/photo.png" alt="作者图片"}\n\n::video{src="https://example.test/video.mp4" label="作者视频"}')
  assert.match(html, /data-pretext-component="Tabs"/)
  assert.match(html, /role="tablist"/)
  assert.equal((html.match(/role="tab"/g) ?? []).length, 2)
  assert.match(html, /aria-label="标签页"/)
  assert.match(html, /data-pretext-component="Image"/)
  assert.match(html, /alt="作者图片"/)
  assert.match(html, /data-pretext-component="Video"/)
  assert.match(html, /<video[^>]*src="https:\/\/example.test\/video.mp4"/)
})

test('numbered Markdown uses the same CSS counter for ordinary and virtualized start offsets', () => {
  for (const lineCount of [3, 150]) {
    const source = '```text showLineNumbers{37}\n' + Array.from({length:lineCount}, (_, index) => `authored ${index}`).join('\n') + '\n```'
    const html = renderMarkdown(source)
    assert.match(html, /counter-set:line 36/)
    assert.doesNotMatch(html, /counter-set:第/)
    assert.ok(html.includes('before:content-[counter(line)]'))
    assert.match(html, /aria-label="第 37 行"/)
    if (lineCount === 150) assert.match(html, /data-pretext-code-virtualized=""/)
  }
})


test('blocked media keeps protocol tokens and Chinese failure labels while preserving author labels', () => {
  const html = renderMarkdown('::image{src="javascript:alert(1)" alt="Original image"}\n\n::video{src="javascript:alert(1)" label="Original video"}')
  assert.match(html, /data-pretext-component="Video"/)
  assert.match(html, /视频已被拦截：Original video/)
  assert.match(html, /Original image/)
  assert.doesNotMatch(html, /src="javascript:/)
})


test('an empty spreadsheet announces its author supplied name in a Chinese empty state', () => {
  const html = renderToStaticMarkup(<XlsxGrid rowCount={0} columnCount={0} sheetName="Original sheet" getCell={() => {throw Error('empty sheet must not read cells')}} scale={1} isolateStyles={false} />)
  assert.match(html, /aria-label="工作表“Original sheet”为空"/)
  assert.match(html, /工作表为空/)
  assert.doesNotMatch(html, /is empty|Empty sheet/)
})
