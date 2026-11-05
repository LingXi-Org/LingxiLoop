import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from 'react'
import type { CommentDraftStore } from './comment-drafts'
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
  drafts,
  onDraftChange,
  observedThreads,
}: {
  observedThreads: EditorComment[]
  drafts: CommentDraftStore
  onDraftChange(key: string, text: string | null): void
  anchorElement: RefObject<HTMLElement | null>
  threadId: string | null
  artifactId: string
  writable: boolean
  anchor: NativeCommentAnchor | null
  label: string
  onClose(restoreFocus?: boolean): void
  onPlaced(threadId?: string): void
  onThreads(threads: EditorComment[]): void
  onNavigate(anchor: string): void
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(''),
    [mutating, setBusy] = useState(false)
  useSyncExternalStore(drafts.subscribe, drafts.getSnapshot)
  useEffect(()=>{setSnapshot(value=>value ? {...value,threads:observedThreads}:value)},[observedThreads])
  const busy = mutating || (threadId ? drafts.pendingForThread(threadId) : anchor ? drafts.pending(`new:${encodeCommentAnchor(anchor)}`) : false)
  const threadBusy = (thread: EditorComment) => busy || drafts.pendingForThread(thread.id,thread.anchor)
  const [resolved, setResolved] = useState(false),
    [composerReset, setComposerReset] = useState(0)
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
  async function mutate(path: string, method: string, body?: unknown, clearKey?: string) {
    const ticket = clearKey ? drafts.begin(clearKey, (body as {text:string}).text) : undefined
    if (clearKey && !ticket) return
    setBusy(true)
    setError('')
    let confirmed = false
    try {
      const result = await http<{ thread?: EditorComment }>(base + path, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      confirmed = true
      if (clearKey) {
        drafts.finish(clearKey, ticket!, true)
        setComposerReset((v) => v + 1)
        setReply(null)
        setEditing(null)
        onPlaced(result.thread?.id)
      }
      await refresh()
    } catch {
      if (clearKey && ticket && !confirmed) drafts.finish(clearKey,ticket,false)
      setError(
        confirmed
          ? '评论已保存，列表尚未更新。请重新加载。'
          : '尚未确认保存。草稿已保留，请刷新列表确认后重试。',
      )
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
      onClose={restore=>{if(restore&&anchor&&!threadId&&!busy)onDraftChange(`new:${encodeCommentAnchor(anchor)}`,null);onClose(restore)}}
    >
      {anchor && !threadId && (
        <span className="native-comment-composer-avatar" aria-hidden="true">
          {snapshot?.me.name.slice(0, 1)}
        </span>
      )}
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
          <IconButton icon="close" label="关闭评论" onClick={() => onClose(true)} />
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
                      disabled={threadBusy(thread)}
                      onClick={() =>
                        void mutate(`/${thread.id}`, 'PATCH', {
                          status: thread.status === 'resolved' ? 'open' : 'resolved',
                        })
                      }
                    />
                    <Menu label="评论操作" icon="more" align="end">
                      <MenuItem
                        icon="delete"
                        disabled={threadBusy(thread)}
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
                          disabled={threadBusy(thread)}
                          onClick={() => {
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
                      pending: '已发送，等待智能体接收',
                      delivered: '智能体已接收',
                      replied: '智能体已回复',
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
                        disabled={threadBusy(thread)}
                        onClick={() => void mutate(`/${thread.id}/send`, 'POST')}
                      >
                        发送给智能体
                      </button>
                    )}
                </footer>
              )}
            </article>
          ))}
        </div>
        {writable &&
          ((anchor && !threadId) || composerThread || editing) &&
          (() => {
            const draftKey = editing
              ? `edit:${editing.threadId}:${editing.messageId}`
              : composerThread
                ? `reply:${composerThread}`
                : `new:${encodeCommentAnchor(anchor!)}`
            const initial = editing
              ? (snapshot?.threads
                  .find((t) => t.id === editing.threadId)
                  ?.messages.find((m) => m.id === editing.messageId)?.text ?? '')
              : ''
            return (
              <CommentComposer
                key={`${draftKey}:${composerReset}`}
                draftKey={draftKey}
                drafts={drafts}
                initial={initial}
                busy={busy || drafts.pending(draftKey) || (composerThread ? drafts.pendingForThread(composerThread):false)}
                editing={!!editing}
                label={editing ? '编辑评论' : composerThread ? '回复评论' : label}
                onDraftChange={onDraftChange}
                onCancel={() => {
                  onDraftChange(draftKey, null)
                  setComposerReset((v) => v + 1)
                  setReply(null)
                  setEditing(null)
                  onPlaced()
                }}
                onSubmit={(text) => {
                  if (editing)
                    void mutate(
                      `/${editing.threadId}/messages/${editing.messageId}`,
                      'PATCH',
                      { text },
                      draftKey,
                    )
                  else if (composerThread)
                    void mutate(`/${composerThread}/messages`, 'POST', { text }, draftKey)
                  else if (anchor)
                    void mutate(
                      '',
                      'POST',
                      { anchor: encodeCommentAnchor(anchor), label, text },
                      draftKey,
                    )
                }}
              />
            )
          })()}
      </aside>
    </FloatingPopover>
  )
}

function CommentComposer({
  draftKey,
  drafts,
  initial,
  label,
  busy,
  editing,
  onDraftChange,
  onCancel,
  onSubmit,
}: {
  draftKey: string
  drafts: CommentDraftStore
  initial: string
  label: string
  busy: boolean
  editing: boolean
  onDraftChange(key: string, text: string | null): void
  onCancel(): void
  onSubmit(text: string): void
}) {
  const text = drafts.get(draftKey) ?? initial
  return (
    <form
      className="native-comment-composer"
      onSubmit={(event) => {
        event.preventDefault()
        if (text.trim() && !busy) onSubmit(text)
      }}
    >
      <label htmlFor="native-comment-text">{label}</label>
      <textarea
        id="native-comment-text"
        aria-label="评论内容"
        placeholder="添加评论…"
        value={text}
        readOnly={busy}
        aria-disabled={busy}
        maxLength={10000}
        autoFocus
        onChange={(event) => {
          const value = event.target.value
          onDraftChange(draftKey, value === initial ? null : value)
        }}
      />
      <footer>
        <button type="button" disabled={busy} onClick={onCancel}>
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
  )
}
