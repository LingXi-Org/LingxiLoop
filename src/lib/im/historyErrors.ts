export function isEmptyHistoryDetail(detail: string): boolean {
  return /not[\s_-]*found|no[\s_-]*messages?|channel[^\r\n]{0,40}(?:missing|does not exist)|不存在|未找到|没有消息|无消息/i.test(detail)
}

type StatusEnvelope = {
  clientMsgNo: string
  payload: {
    kind: string
    clientMsgNo: string
    body?: string
    refs?: Record<string, string>
    data?: Record<string, unknown>
  }
}

export function isInternalAgentStatus(message: StatusEnvelope): boolean {
  const { payload } = message
  return payload.kind === 'tool_activity'
    && payload.data?.stage === 'started'
    && typeof payload.refs?.runId === 'string'
    && (payload.clientMsgNo.startsWith('preview-') || payload.body === 'Agent started working')
}
