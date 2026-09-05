const STATUS_MESSAGES: ReadonlyArray<[RegExp, string]> = [
  [/\b401\b/, '登录状态已失效，请重新登录。'],
  [/\b403\b/, '你没有执行此操作的权限。'],
  [/\b404\b/, '相关内容不存在或已不可访问。'],
  [/\b409\b/, '内容已经发生变化，请刷新后重试。'],
  [/\b429\b/, '操作过于频繁，请稍后再试。'],
  [/\b5\d\d\b/, '服务暂时不可用，请稍后再试。'],
]

/** Keep server and protocol details out of product copy while preserving logs. */
export function userFacingError(
  error: unknown,
  fallback = '操作未完成，请稍后重试。',
): string {
  const detail = error instanceof Error ? error.message : String(error ?? '')
  for (const [pattern, message] of STATUS_MESSAGES) {
    if (pattern.test(detail)) return message
  }
  return fallback
}
