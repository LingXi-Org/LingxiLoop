import type { CanvasFrame } from '../contracts'
import { TypesetMarkdown } from '@/components/Typeset'

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
  if (frame.type === 'markdown' || frame.type === 'document') {
    const content = frame.content || (frame.type === 'document' ? '等待文档内容' : '')
    return (
      <div className={preview ? 'canvas-content-surface canvas-frame-markdown-preview' : 'canvas-content-surface'}>
        <TypesetMarkdown content={content} preset={preview ? 'preview' : 'canvas'} className={preview ? undefined : 'p-4'} />
        {!preview && frame.type === 'document' && typeof frame.data.documentId === 'string' && <span className="canvas-linked-document mt-3 block text-xs">文档 · 已关联</span>}
      </div>
    )
  }
  if (frame.type === 'image') {
    return frame.content
      ? <img src={frame.content} alt={String(frame.data.alt ?? frame.title)} className="h-full w-full object-contain" />
      : <EmptyFrame label="等待图片内容" />
  }
  return (
    <div className={`canvas-artifact-content ${preview ? 'p-2' : 'p-5'}`}>
      <div className="text-[9px] font-semibold tracking-wider text-ink-400">成果数据</div>
      <pre className={preview ? 'mt-1 line-clamp-5 whitespace-pre-wrap break-words font-mono text-[8px] text-ink-secondary' : 'mt-3 whitespace-pre-wrap break-words font-mono text-xs text-ink-secondary'}>
        {frame.content || JSON.stringify(frame.data, null, 2) || '尚无成果数据'}
      </pre>
    </div>
  )
}

function EmptyFrame({ label }: { label: string }) {
  return <div className="canvas-frame-empty grid h-full place-items-center p-6 text-center text-xs text-ink-400">{label}</div>
}
