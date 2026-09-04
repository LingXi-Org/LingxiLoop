export interface BriefingPolicy {
  version: string
  meaningfulAfterMinutes: number
  maxAttentionItems: number
}

export interface ProjectVisit {
  company_id: string
  project_id: string
  user_id: string
  meaningful_visit_version: number
  visit_event_sequence: string
  event_sequence_watermark: string
}

export interface TeacherBriefingDelivery {
  id: string
  company_id: string
  project_id: string
  teacher_user_id: string
  context_thread_id: string
  client_msg_no: string
  summary: string
  statistics: Record<string, number>
  window_start_sequence: string
  window_end_sequence: string
  channel_id: string
  agent_id: string
  attention_item_ids: string[]
  lease_token: string
}
