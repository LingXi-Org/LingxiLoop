import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { requireArtifact } from '../../http/authorization.js'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { readNewThread, readReply, readStatus, readEdit } from './comments.js'
import { createComment, listComments, replyComment, editComment, deleteComment, setCommentStatus, sendComment } from './facade.js'
import { availableAgents } from './repository.js'
import { slideWorkspaceConversation } from './slides-workspace.js'

/** The native host uses product auth; grants remain reserved for isolated content. */
export const nativeCommentsRouter = Router()
nativeCommentsRouter.all('/artifacts/:id/comments{/:threadId}{/:action}{/:messageId}', safe(async (req, res) => {
  const artifactId = String(req.params.id), read = req.method === 'GET' || req.method === 'HEAD'
  const scope = await requireArtifact(req, artifactId, !read)
  const { rows } = await pool.query<{ name: string }>('SELECT display_name AS name FROM users WHERE id=$1', [scope.userId])
  const author = { kind: 'user' as const, id: scope.userId, name: rows[0]?.name ?? '用户' }
  const threadId = req.params.threadId ? String(req.params.threadId) : null, action = req.params.action ? String(req.params.action) : null
  if (!threadId && read) {
    const [{ doc }, conversationId] = await Promise.all([listComments(scope.companyId, artifactId, true), slideWorkspaceConversation(pool, artifactId, scope.conversationId)])
    const agents = conversationId ? await availableAgents(pool, scope.companyId, conversationId, scope.kind) : []
    res.set('Cache-Control', 'no-store').json({ threads: doc.threads, me: author, agent: { available: agents.length > 0 } }); return
  }
  if (!threadId && req.method === 'POST') {
    const thread = readNewThread(req.body); if (!thread) throw new HttpError(400, '评论内容无效')
    res.status(201).json({ thread: await createComment({ companyId: scope.companyId, artifactId, author, thread }) }); return
  }
  if (threadId && !action && req.method === 'PATCH') {
    const status = readStatus(req.body); if (!status) throw new HttpError(400, '评论状态无效')
    res.json({ thread: await setCommentStatus({ companyId: scope.companyId, artifactId, commentId: threadId, status }) }); return
  }
  if (threadId && !action && req.method === 'DELETE') { await deleteComment({ companyId: scope.companyId, artifactId, commentId: threadId }); res.json({ deleted: threadId }); return }
  if (threadId && action === 'messages' && req.method === 'POST') {
    const input = readReply(req.body); if (!input) throw new HttpError(400, '回复内容无效')
    res.json({ thread: await replyComment({ companyId: scope.companyId, artifactId, author, commentId: threadId, ...input }) }); return
  }
  if (threadId && action === 'messages' && req.params.messageId && req.method === 'PATCH') {
    const input = readEdit(req.body); if (!input) throw new HttpError(400, '评论内容无效')
    res.json({ thread: await editComment({ companyId: scope.companyId, artifactId, author, commentId: threadId, messageId: String(req.params.messageId), ...input }) }); return
  }
  if (threadId && action === 'send' && req.method === 'POST') { res.json({ thread: await sendComment({ companyId: scope.companyId, artifactId, author, commentId: threadId }) }); return }
  res.status(405).set('Allow', 'GET, HEAD, POST, PATCH, DELETE').json({ error: 'Method not allowed' })
}))
