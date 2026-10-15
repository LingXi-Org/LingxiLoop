import { z } from 'zod'
import type { Queryable } from '../../db/queryable.js'
import { getAgentChannelHistory } from '../../im/public.js'
import { nativeAttachments, nativeText } from '../../im/message-types.js'
import type { LearningScope } from './contracts.js'
import { createPermissionService } from '../access/public.js'
import { LearningApplicationError } from './errors.js'

const id = z.string().trim().min(1).max(200)
export const conversationReferenceSchema = z.object({ channelId: id, messageIds: z.array(id).min(2).max(80) }).strict()
export const conversationReferencesSchema = z.array(conversationReferenceSchema).min(1, '请关联至少一段有本人作答和助手回复的对话').max(20)
export type ConversationReference = z.infer<typeof conversationReferenceSchema>
export interface EvidenceMessage { id: string; role: 'user' | 'assistant'; text: string; sequence: number }
export interface ConversationEvidence extends ConversationReference { title: string; capturedAt: string; messages: EvidenceMessage[] }

// Only the student's personal course conversation is selectable. Sharing a frozen
// excerpt never grants the teacher conversation:read or access to private files.
export async function evidenceConversations(db: Queryable, scope: LearningScope, projectId: string, channelId?: string, offset = 0) {
  const { rows } = await db.query<{ channelId: string; title: string; agentId: string }>(`WITH rooms AS (
    SELECT id AS channel_id,title FROM conversations WHERE company_id=$1 AND project_id=$2
    UNION
    SELECT channel_id,'作业学习对话' AS title FROM context_threads WHERE company_id=$1 AND project_id=$2 AND created_by=$3
  ) SELECT DISTINCT r.channel_id AS "channelId",r.title,p.id AS "agentId" FROM rooms r
    JOIN im_channel_bindings b ON b.channel_id=r.channel_id AND b.company_id=$1
    JOIN participants p ON p.company_id=$1 AND p.kind='agent' AND p.departed_at IS NULL AND b.profile->'members' ? p.id
    WHERE b.profile->'members' ? $3 AND jsonb_array_length(b.profile->'members')=2
      AND ($4::text IS NULL OR r.channel_id=$4)
    ORDER BY r.channel_id LIMIT 51 OFFSET $5`, [scope.companyId,projectId,scope.userId,channelId ?? null,offset])
  return rows
}

export async function evidenceMessages(db: Queryable, scope: LearningScope, projectId: string, channelId: string, beforeSequence = 0) {
  await createPermissionService(db).assertCan({actorUserId:scope.userId,companyId:scope.companyId,action:'conversation:read',resource:{type:'conversation',id:channelId}})
  const room = (await evidenceConversations(db,scope,projectId,channelId))[0]
  if (!room) throw new LearningApplicationError('forbidden','请选择本课程中你与助手的私人对话')
  const history = await getAgentChannelHistory({ companyId:scope.companyId,agentId:room.agentId,channelId,limit:200,beforeSequence })
  if (!history || history.some(message => message.channelId!==channelId || !Number.isSafeInteger(message.messageSeq) || message.messageSeq<1)) {
    throw new LearningApplicationError('forbidden','对话记录不可访问')
  }
  const messages: EvidenceMessage[] = history.flatMap(message => {
    const role: 'user' | 'assistant' | null = message.fromUid===scope.userId ? 'user' : message.fromUid===room.agentId ? 'assistant' : null
    const text = nativeText(message.payload).trim() || (nativeAttachments(message.payload).length ? '[附件消息：仅引用文件名，附件内容未共享] '+nativeAttachments(message.payload).map(file=>file.name).join('、') : '')
    return role && message.payload.role===role && text ? [{id:message.clientMsgNo,role:role as 'user'|'assistant',text,sequence:message.messageSeq}] : []
  }).sort((a,b)=>a.sequence-b.sequence)
  const next = history.length===200 ? Math.min(...history.map(message=>message.messageSeq)) : null
  return { ...room,messages,nextBefore:next && next>1 ? next : null }
}

export async function captureConversationEvidence(db: Queryable, scope: LearningScope, projectId: string, input: ConversationReference[]): Promise<ConversationEvidence[]> {
  const references = conversationReferencesSchema.parse(input), result: ConversationEvidence[] = []
  const deadline = Date.now()+30_000
  for (const reference of references) {
    let before = 0
    const collected: EvidenceMessage[] = []
    let title = ''
    // Read canonical history, not client-supplied text. Bounded ranges include
    // intervening assistant help; later/unselected messages are never shared.
    while (true) {
      if (Date.now()>deadline) throw new LearningApplicationError('conflict','对话读取超时，请重试')
      const page = await evidenceMessages(db,scope,projectId,reference.channelId,before)
      title=page.title; collected.unshift(...page.messages)
      if (reference.messageIds.every(id=>collected.some(message=>message.id===id))) break
      if (!page.nextBefore) throw new LearningApplicationError('invalid','引用消息不存在或不是有效文字对话')
      if (before && page.nextBefore>=before) throw new LearningApplicationError('conflict','对话分页未前进')
      before=page.nextBefore
      if (collected.length>10000) throw new LearningApplicationError('invalid','请选择较近的对话片段')
    }
    const selected=collected.filter(message=>reference.messageIds.includes(message.id))
    const first=Math.min(...selected.map(message=>message.sequence)),last=Math.max(...selected.map(message=>message.sequence))
    const messages=collected.filter(message=>message.sequence>=first && message.sequence<=last)
    if (messages.length>80 || JSON.stringify(messages).length>60000) throw new LearningApplicationError('invalid','对话片段过长，请缩小引用范围')
    if (messages[0]?.role!=='user' || messages.at(-1)?.role!=='assistant' || new Set(reference.messageIds).size!==reference.messageIds.length) {
      throw new LearningApplicationError('invalid','引用须包含你的一次真实提问或作答，以及之后的助手回复')
    }
    result.push({...reference,title,capturedAt:new Date().toISOString(),messages})
  }
  if (JSON.stringify(result).length>120000) throw new LearningApplicationError('invalid','引用总量过大，请精简片段')
  return result
}
