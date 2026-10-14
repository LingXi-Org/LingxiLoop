import type { Queryable } from '../../db/queryable.js'
import { getAgentChannelHistory } from '../../im/public.js'
import type { ImMessageEnvelope } from '../../im/messages-application.js'
import { nativeAttachments, nativeText } from '../../im/message-types.js'
import { LearningApplicationError } from './errors.js'
import type { HomeworkRow, HomeworkStateRow } from './homework-repository.js'

export async function assertHomeworkConversation(db:Queryable,hw:HomeworkRow,state:HomeworkStateRow) {
  if(!state.agent_id||!state.channel_id) throw new LearningApplicationError('conflict','学习对话尚未建立')
  const {rows}=await db.query(`SELECT 1 FROM context_threads t JOIN participants p ON p.id=$5 AND p.company_id=t.company_id
    JOIN im_channel_bindings b ON b.channel_id=t.channel_id AND b.company_id=t.company_id
    WHERE t.company_id=$1 AND t.project_id=$2 AND t.context_type='HOMEWORK' AND t.context_id=$3 AND t.channel_id=$4
      AND t.created_by=$6 AND p.kind='agent' AND p.departed_at IS NULL
      AND b.profile->'members' @> jsonb_build_array($5::text,$6::text) AND jsonb_array_length(b.profile->'members')=2`,
    [hw.company_id,hw.project_id,`${hw.id}:${state.learner_id}`,state.channel_id,state.agent_id,state.learner_id])
  if(!rows.length) throw new LearningApplicationError('forbidden','学习对话权限或助手绑定已变化')
}

export function isHomeworkLearningRecord(message:ImMessageEnvelope,state:HomeworkStateRow) {
  return message.channelId===state.channel_id&&message.fromUid===state.learner_id&&message.payload.role==='user'
    && Boolean(nativeText(message.payload).trim()||nativeAttachments(message.payload).length)
}

async function* conversationPages(db:Queryable,hw:HomeworkRow,state:HomeworkStateRow) {
  if(!state.agent_id||!state.channel_id) return
  await assertHomeworkConversation(db,hw,state)
  let beforeSequence=0
  const deadline=Date.now()+30000
  while(true) {
    if(Date.now()>deadline) throw new LearningApplicationError('conflict','学习记录读取超时，请稍后重试')
    const messages=await getAgentChannelHistory({companyId:hw.company_id,agentId:state.agent_id,channelId:state.channel_id,limit:200,beforeSequence})
    if(!messages) throw new LearningApplicationError('forbidden','学习对话不可访问')
    if(messages.some(message=>message.channelId!==state.channel_id||!Number.isSafeInteger(message.messageSeq)||message.messageSeq<1)) {
      throw new LearningApplicationError('forbidden','学习记录不属于当前对话')
    }
    if(!messages.length) return
    const next=Math.min(...messages.map(message=>message.messageSeq)),hasMore=messages.length===200&&next>1
    if(beforeSequence&&next>=beforeSequence) throw new LearningApplicationError('conflict','学习记录分页未前进')
    yield {messages,hasMore}
    if(!hasMore) return
    beforeSequence=next
  }
}

export async function hasHomeworkLearningRecord(db:Queryable,hw:HomeworkRow,state:HomeworkStateRow) {
  for await(const page of conversationPages(db,hw,state)) if(page.messages.some(message=>isHomeworkLearningRecord(message,state))) return true
  return false
}

export async function readHomeworkConversation(db:Queryable,hw:HomeworkRow,state:HomeworkStateRow) {
  const messages:ImMessageEnvelope[]=[]
  let truncated=false
  for await(const page of conversationPages(db,hw,state)) {
    if(messages.length<1000) messages.push(...page.messages)
    else {
      // An older genuine record still establishes participation when recent messages are all assistant replies.
      const record=page.messages.find(message=>isHomeworkLearningRecord(message,state))
      if(record) messages.push(record)
      truncated=true
    }
    if(messages.length>=1000&&page.hasMore&&messages.some(message=>isHomeworkLearningRecord(message,state))) {
      truncated=true;break
    }
  }
  return {messages:messages.sort((a,b)=>a.messageSeq-b.messageSeq),truncated}
}
