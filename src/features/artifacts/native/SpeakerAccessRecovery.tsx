import { createPortal } from 'react-dom'
interface Props {
  win: Window
  error: string
  loading: boolean
  retained: boolean
  onDownload(): void
  onReload(): void
  onRetry(): void
}
/** Access failures expose local recovery only; document content stays unmounted. */
export default function SpeakerAccessRecovery({
  win,
  error,
  loading,
  retained,
  onDownload,
  onReload,
  onRetry,
}: Props) {
  if (win.closed) return null
  return createPortal(
    <section
      className="native-speaker-access"
      data-native-editor-boundary
      role={loading ? 'status' : 'alert'}
      aria-label="讲者备注恢复"
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault()
          event.stopPropagation()
          if (retained) onDownload()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          win.close()
        }
      }}
    >
      <style>{`.native-speaker-access{position:fixed;inset:0;padding:24px;box-sizing:border-box;background:#141413;color:#faf9f5;font:15px/1.625 system-ui,sans-serif;color-scheme:dark}.native-speaker-access p{max-width:60ch;margin:0 0 16px}.native-speaker-access>div{display:flex;flex-wrap:wrap;gap:8px}.native-speaker-access button{padding:6px 12px;border:1px solid #faf9f533;border-radius:8px;background:#ffffff0a;color:inherit;font:inherit;cursor:pointer}.native-speaker-access button:hover{background:#ffffff1a}.native-speaker-access button:focus-visible{outline:2px solid #3987e5;outline-offset:2px}`}</style>
      <p>
        {loading ? '正在重新检查稿件访问权限…' : error || '当前无法访问此稿件，请检查权限。'}
        {retained && !loading ? '本地修改已保留，可下载副本。' : ''}
      </p>
      <div>
        {retained && (
          <button type="button" autoFocus onClick={onDownload}>
            下载本地副本
          </button>
        )}
        {!loading &&
          (retained ? (
            <button type="button" onClick={onReload}>
              保留副本并重新载入
            </button>
          ) : (
            <button type="button" autoFocus onClick={onRetry}>
              重试
            </button>
          ))}
        <button type="button" onClick={() => win.close()}>
          关闭窗口
        </button>
      </div>
    </section>,
    win.document.body,
  )
}
