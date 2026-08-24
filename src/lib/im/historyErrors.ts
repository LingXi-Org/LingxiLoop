export function isEmptyHistoryDetail(detail: string): boolean {
  return /not[\s_-]*found|no[\s_-]*messages?|channel[^\r\n]{0,40}(?:missing|does not exist)|不存在|未找到|没有消息|无消息/i.test(detail)
}
