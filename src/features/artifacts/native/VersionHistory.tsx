import { lazy, Suspense, useEffect, useState, type RefObject } from 'react'
import { artifactsApi, type SlideRevisions } from '../api'
import { EditorIcon, FloatingPopover, IconButton, Modal } from './EditorPrimitives'

const NativeEditor = lazy(() => import('./NativeEditor'))
export default function VersionHistory({
  artifactId,
  kind,
  title,
  documentSeq,
  pageNames,
  dirty,
  writable,
  anchor,
  onClose,
  onRestored,
}: {
  artifactId: string
  kind: 'design' | 'slides'
  title: string
  documentSeq: number
  pageNames: Record<string, string>
  dirty: boolean
  writable: boolean
  anchor: RefObject<HTMLElement | null>
  onClose(restoreFocus?: boolean): void
  onRestored(): Promise<void>
}) {
  const [snapshot, setSnapshot] = useState<SlideRevisions | null>(null),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0)
  const [selected, setSelected] = useState<string | null>(null),
    [preview, setPreview] = useState<string | null>(null),
    [restoring, setRestoring] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    void artifactsApi
      .revisions(artifactId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setSnapshot(value)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('版本记录尚未加载，请重试。')
      })
    return () => controller.abort()
  }, [artifactId, documentSeq, refresh])
  async function restore(seq: string) {
    if (!snapshot || dirty || !writable || restoring) return
    setRestoring(true)
    setError('')
    try {
      await artifactsApi.restoreRevision(artifactId, seq, snapshot.current)
      await onRestored()
      onClose(true)
    } catch {
      setError('恢复尚未完成。请重新加载版本记录后重试。')
    } finally {
      setRestoring(false)
    }
  }
  if (preview !== null)
    return (
      <Modal editorBoundary title="历史版本预览" onClose={() => setPreview(null)}>
        <div className="native-revision-preview">
          <Suspense fallback={<p role="status">正在加载历史版本…</p>}>
            <NativeEditor
              key={preview}
              artifactId={artifactId}
              kind={kind}
              title={title}
              revisionSeq={preview}
            />
          </Suspense>
        </div>
        <footer className="native-revision-actions">
          <span>版本 {preview} · 仅查看</span>
          <button
            type="button"
            className="native-primary"
            disabled={dirty || !writable || restoring}
            onClick={() => void restore(preview)}
          >
            恢复此版本
          </button>
        </footer>
        {error && <p role="alert">{error}</p>}
      </Modal>
    )
  let previousDay = ''
  return (
    <FloatingPopover
      anchor={anchor}
      label="版本历史"
      className="native-version-history"
      onClose={onClose}
    >
      <header>
        <h2>版本历史</h2>
        <IconButton icon="close" label="关闭版本历史" onClick={() => onClose(true)} />
      </header>
      {error && (
        <div role="alert">
          {error}
          <button type="button" onClick={() => setRefresh((v) => v + 1)}>
            重新加载
          </button>
        </div>
      )}
      {!snapshot ? (
        <p role="status">正在加载版本…</p>
      ) : !snapshot.revisions.length ? (
        <p>首次保存后会显示版本。</p>
      ) : (
        snapshot.revisions.map((revision, index) => {
          const date = new Date(revision.createdAt),
            day = date.toLocaleDateString('zh-CN'),
            heading =
              day === previousDay
                ? ''
                : day === new Date().toLocaleDateString('zh-CN')
                  ? '今天'
                  : day
          previousDay = day
          const current = revision.version === snapshot.current,
            first = index === snapshot.revisions.length - 1,
            name = first
              ? '最初的版本'
              : revision.actorName || (revision.actorKind === 'agent' ? 'Agent' : '用户')
          const changed = (revision.changedPageIds ?? [])
              .map((id) => pageNames[id] ?? id)
              .join('、'),
            expanded = selected === revision.seq && !current
          return (
            <div key={revision.seq}>
              {heading && <h3>{heading}</h3>}
              <article className="native-version-entry" data-expanded={expanded}>
                <span
                  className={`native-version-avatar ${revision.actorKind === 'agent' ? 'native-version-agent' : ''}`}
                  aria-hidden="true"
                >
                  {first ? (
                    <EditorIcon name="history" size={16} />
                  ) : revision.actorKind === 'agent' ? (
                    <EditorIcon name="agent" size={18} />
                  ) : (
                    name.slice(0, 1)
                  )}
                </span>
                <div>
                  <button
                    type="button"
                    className="native-version-select"
                    aria-label={`版本 ${revision.seq}：${name}`}
                    aria-expanded={expanded}
                    onClick={() => setSelected(expanded ? null : revision.seq)}
                  >
                    <span>{name}</span>
                    <time dateTime={revision.createdAt}>
                      {date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </button>
                  <p>{first ? '历史从这里开始' : changed || '稿件内容与设置'}</p>
                  {current && <span className="native-version-current">当前版本</span>}
                  {expanded && (
                    <footer>
                      <button type="button" onClick={() => setPreview(revision.seq)}>
                        预览
                      </button>
                      <button
                        type="button"
                        className="native-primary"
                        disabled={dirty || !writable || restoring}
                        onClick={() => void restore(revision.seq)}
                      >
                        {restoring ? '正在恢复…' : '恢复此版本'}
                      </button>
                    </footer>
                  )}
                </div>
              </article>
            </div>
          )
        })
      )}
      {dirty && <p>保存当前修改后即可恢复版本。</p>}
      <p className="native-version-help">
        Agent 表示由智能体保存的修改。恢复会创建新版本，后续修改仍可从历史记录中找回。
      </p>
    </FloatingPopover>
  )
}
