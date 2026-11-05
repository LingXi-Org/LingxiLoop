import { useCallback, useEffect, useState, type RefObject } from 'react'
import { http } from '@/api/core/http'
import { ws } from '@/api/core/realtime'
import {
  encodeCommentAnchor,
  type NativeCommentAnchor,
} from '../../../../shared/artifact-comment-anchor'
import { IconButton, Menu, MenuItem, FloatingPopover, EditorIcon } from './EditorPrimitives'

export interface EditorComment {
  id: string
  anchor: string
  label: string
  status: 'open' | 'resolved'
  agent?: { status: 'pending' | 'delivered' | 'replied' }
  messages: Array<{
    id: string
    text: string
    author: { kind: 'user' | 'agent'; id?: string; name: string }
    at: string
    editedAt?: string
  }>
}
interface Snapshot {
  threads: EditorComment[]
  me: { id: string; name: string }
  agent: { available: boolean }
}
export default function CommentsPanel({
  artifactId,
  writable,
  anchor,
  label,
  onClose,
  onPlaced,
  onThreads,
  onNavigate,
  anchorElement,
  threadId,
}: {
  anchorElement: RefObject<HTMLElement | null>
  threadId: string | null
  artifactId: string
  writable: boolean
  anchor: NativeCommentAnchor | null
  label: string
  onClose(restoreFocus?:boolean): void
  onPlaced(threadId?: string): void
  onThreads(threads: EditorComment[]): void
  onNavigate(anchor: string): void
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [text, setText] = useState(''),
    [resolved, setResolved] = useState(false)
  const [reply, setReply] = useState<string | null>(null),
    [editing, setEditing] = useState<{ threadId: string; messageId: string } | null>(null)
  const base = `/artifacts/${encodeURIComponent(artifactId)}/comments`
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const value = await http<Snapshot>(base, { signal })
      if (signal?.aborted) return
      setSnapshot(value)
      onThreads(value.threads)
    },
    [base, onThreads],
  )
  useEffect(() => {
    const controller = new AbortController()
    const update = () =>
      void refresh(controller.signal).catch(() => {
        if (!controller.signal.aborted) setError('评论尚未加载，请重试。')
      })
    update()
    const timer = setInterval(update, 5000)
    const stop = ws.on((event) => {
      if (event.type === 'artifact.changed' && event.artifactId === artifactId) update()
    })
    return () => {
      controller.abort()
      clearInterval(timer)
      stop()
    }
  }, [refresh, artifactId])
  async function mutate(path: string, method: string, body?: unknown, clear = false) {
    setBusy(true)
    setError('')
    try {
      const result = await http<{ thread?: EditorComment }>(base + path, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (clear) {
        setText('')
        setReply(null)
        setEditing(null)
        onPlaced(result.thread?.id)
      }
      await refresh()
    } catch {
      setError('修改尚未保存。内容已保留，请重试。')
    } finally {
      setBusy(false)
    }
  }
  const threads =
    anchor && !threadId
      ? []
      : (snapshot?.threads.filter((t) =>
          threadId ? t.id === threadId : resolved || t.status === 'open',
        ) ?? [])
  const composerThread =
    reply ??
    (threadId && threads.some((t) => t.id === threadId && t.status === 'open') ? threadId : null)
  return (
    <FloatingPopover
      anchor={anchorElement}
      align={anchor ? 'start' : 'end'}
      label={threadId ? '评论线程' : anchor ? '添加评论' : '全部评论'}
      className={`native-comment-popover ${anchor && !threadId ? 'native-comments-composing' : threadId ? 'native-comments-thread' : 'native-comments-all'}`}
      onClose={onClose}
    >
      {anchor&&!threadId&&<span className="native-comment-composer-avatar" aria-hidden="true">{snapshot?.me.name.slice(0,1)}</span>}
      <aside
        className="native-comments-panel"
        aria-label={threadId ? '评论线程' : anchor ? '添加评论' : '全部评论'}
      >
        <header>
          <h3>{threadId ? '评论' : '全部评论'}</h3>
          <Menu label="评论筛选" icon="more" align="end">
            <MenuItem selected={resolved} onClick={() => setResolved((v) => !v)}>
              显示已解决的评论
            </MenuItem>
          </Menu>
          <IconButton icon="close" label="关闭评论" onClick={()=>onClose(true)} />
        </header>
        {error && (
          <div role="alert" className="native-comment-error">
            {error}
            <button
              type="button"
              onClick={() => void refresh().catch(() => setError('评论尚未加载，请重试。'))}
            >
              重试
            </button>
          </div>
        )}
        <div className="native-comment-list">
          {!snapshot ? (
            <p role="status">正在加载评论…</p>
          ) : (
            !threads.length && <p className="native-comment-empty">暂无评论</p>
          )}
          {threads.map((thread) => (
            <article key={thread.id} className="native-comment-card" data-comment-id={thread.id}>
              <header>
                <button
                  type="button"
                  className="native-comment-location"
                  onClick={() => onNavigate(thread.anchor)}
                >
                  {thread.label}
                </button>
                {writable && (
                  <>
                    <IconButton
                      icon="check"
                      label={thread.status === 'resolved' ? '重新打开评论' : '解决评论'}
                      active={thread.status === 'resolved'}
                      disabled={busy}
                      onClick={() =>
                        void mutate(`/${thread.id}`, 'PATCH', {
                          status: thread.status === 'resolved' ? 'open' : 'resolved',
                        })
                      }
                    />
                    <Menu label="评论操作" icon="more" align="end">
                      <MenuItem
                        icon="delete"
                        onClick={() => void mutate(`/${thread.id}`, 'DELETE')}
                      >
                        删除评论
                      </MenuItem>
                    </Menu>
                  </>
                )}
              </header>
              {thread.messages.map((message) => (
                <div className="native-comment-message" key={message.id}>
                  <div className="native-comment-author">
                    <span className="native-comment-avatar">{message.author.name.slice(0, 1)}</span>
                    <strong>{message.author.name}</strong>
                    <time dateTime={message.at}>
                      {new Date(message.at).toLocaleDateString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                      })}
                    </time>
                    {writable &&
                      message.author.kind === 'user' &&
                      message.author.id === snapshot?.me.id && (
                        <IconButton
                          icon="pencil"
                          label="编辑评论"
                          onClick={() => {
                            setText(message.text)
                            setEditing({ threadId: thread.id, messageId: message.id })
                            setReply(null)
                          }}
                        />
                      )}
                  </div>
                  <p>{message.text}</p>
                </div>
              ))}
              {thread.agent && (
                <p className="native-comment-receipt">
                  {
                    {
                      pending: '已发送，等待 Agent 接收',
                      delivered: 'Agent 已接收',
                      replied: 'Agent 已回复',
                    }[thread.agent.status]
                  }
                </p>
              )}
              {writable && (
                <footer>
                  <button
                    type="button"
                    onClick={() => {
                      setReply(thread.id)
                      setEditing(null)
                      setText('')
                    }}
                  >
                    回复
                  </button>
                  {snapshot?.agent.available &&
                    thread.status === 'open' &&
                    thread.messages.at(-1)?.author.kind === 'user' &&
                    thread.agent?.status !== 'pending' &&
                    thread.agent?.status !== 'delivered' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void mutate(`/${thread.id}/send`, 'POST')}
                      >
                        发送给 Agent
                      </button>
                    )}
                </footer>
              )}
            </article>
          ))}
        </div>
        {writable && ((anchor && !threadId) || composerThread || editing) && (
          <form
            className="native-comment-composer"
            onSubmit={(event) => {
              event.preventDefault()
              if (!text.trim() || busy) return
              if (editing)
                void mutate(
                  `/${editing.threadId}/messages/${editing.messageId}`,
                  'PATCH',
                  { text },
                  true,
                )
              else if (composerThread)
                void mutate(`/${composerThread}/messages`, 'POST', { text }, true)
              else if (anchor)
                void mutate('', 'POST', { anchor: encodeCommentAnchor(anchor), label, text }, true)
            }}
          >
            <label htmlFor="native-comment-text">
              {editing ? '编辑评论' : composerThread ? '回复评论' : label}
            </label>
            <textarea
              id="native-comment-text"
              aria-label="评论内容"
              placeholder="添加评论…"
              value={text}
              maxLength={10000}
              autoFocus
              onChange={(e) => setText(e.target.value)}
            />
            <footer>
              <button
                type="button"
                onClick={() => {
                  setText('')
                  setReply(null)
                  setEditing(null)
                  onPlaced()
                }}
              >
                取消
              </button>
              <button type="submit" className="native-primary" disabled={!text.trim() || busy}>
                <span className="native-visually-hidden">
                  {busy ? '正在保存…' : editing ? '保存' : '发送'}
                </span>
                <EditorIcon name="up" size={18} />
              </button>
            </footer>
          </form>
        )}
      </aside>
    </FloatingPopover>
  )
}
