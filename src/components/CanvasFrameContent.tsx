import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import type { CanvasFrame } from '@/types'

export function CanvasFrameContent({ frame, preview = false }: { frame: CanvasFrame; preview?: boolean }) {
  if (frame.type === 'html') {
    return (
      <iframe
        title={frame.title}
        sandbox=""
        srcDoc={frame.content}
        tabIndex={preview ? -1 : undefined}
        className="canvas-frame-iframe pointer-events-none h-full min-h-40 w-full border-0"
      />
    )
  }
  if (frame.type === 'markdown') {
    return (
      <div className={preview ? 'canvas-frame-markdown-preview' : 'prose prose-sm max-w-none p-4 text-ink'}>
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{frame.content}</ReactMarkdown>
      </div>
    )
  }
  if (frame.type === 'image') {
    return frame.content
      ? <img src={frame.content} alt={String(frame.data.alt ?? frame.title)} className="h-full w-full object-contain" />
      : <EmptyFrame label="等待图片内容" />
  }
  if (frame.type === 'document') {
    return (
      <div className={preview ? 'flex h-full flex-col justify-between p-2' : 'flex h-full flex-col justify-between p-5'}>
        <div>
          <div className="text-[9px] font-semibold tracking-wider text-ink-400">文档引用</div>
          <p className={preview ? 'mt-1 line-clamp-4 whitespace-pre-wrap text-[9px] text-ink-secondary' : 'mt-3 whitespace-pre-wrap text-sm text-ink-secondary'}>
            {frame.content || '等待文档内容'}
          </p>
        </div>
        {!preview && typeof frame.data.documentId === 'string' && <span className="text-xs text-accent">文档 · 已关联</span>}
      </div>
    )
  }
  return (
    <div className={preview ? 'p-2' : 'p-5'}>
      <div className="text-[9px] font-semibold tracking-wider text-ink-400">成果数据</div>
      <pre className={preview ? 'mt-1 line-clamp-5 whitespace-pre-wrap break-words font-mono text-[8px] text-ink-secondary' : 'mt-3 whitespace-pre-wrap break-words font-mono text-xs text-ink-secondary'}>
        {frame.content || JSON.stringify(frame.data, null, 2) || '尚无成果数据'}
      </pre>
    </div>
  )
}

function EmptyFrame({ label }: { label: string }) {
  return <div className="grid h-full place-items-center p-6 text-center text-xs text-ink-400">{label}</div>
}
