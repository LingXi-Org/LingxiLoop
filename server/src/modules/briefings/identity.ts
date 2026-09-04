import { createHash } from 'node:crypto'

export function teacherBriefingIdentity(input: {
  companyId: string; projectId: string; teacherUserId: string; meaningfulVisitVersion: number
}): { id: string; clientMsgNo: string } {
  const key = [input.companyId, input.projectId, input.teacherUserId, input.meaningfulVisitVersion].join('\0')
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 24)
  return { id: `briefing-${digest}`, clientMsgNo: `briefing-msg-${digest}` }
}
