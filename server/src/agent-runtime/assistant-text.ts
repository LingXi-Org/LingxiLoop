/** Reject a malformed answer, never rewrite or guess which sentences to remove. */
export function assistantTextViolation(text: string): string | null {
  if (!text.trim()) return 'Return substantive user-facing content, not an empty answer.'
  // Fenced code is legitimate quoted data, including examples of wire protocols.
  const prose = text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '')
  if (/^\s*<\|(?:im_start|im_end|channel|analysis|assistant)[^\n]*/m.test(prose)
    || /^\s*<(?:think|analysis)>[\s\S]*?<\/(?:think|analysis)>\s*/i.test(prose)) {
    return 'Internal protocol or reasoning blocks are not a user answer. Produce only the settled answer using native tools for operations.'
  }
  // Reject clusters of response-planning directives, not ordinary teaching vocabulary.
  // Quoted examples are data; this guard never removes or rewrites user-visible sentences.
  const narration = prose.replace(/^>.*$/gm, '')
  const directives = narration.match(/\blet me (?:think|structure|craft|write)|\bthe user (?:is asking|wants)|\bI (?:should|need to) (?:answer|respond|write)|我(?:应该|需要|要|现在)(?:直接|先|再)?(?:回复|回应|输出|回答|交付)|最终(?:中文)?回复如下|写最终(?:回复|回答)|我的角色是|让我(?:先)?(?:理清|组织)|我应该用(?:结构化|中文)|让我直接给出最终/gi) ?? []
  if (directives.length >= 3 && new Set(directives.map(value => value.toLowerCase())).size >= 2) {
    return 'The answer contains repeated internal response-planning directives. Return the settled answer to the user; do not narrate how to write it.'
  }
  const counts = new Map<string, number>()
  for (const paragraph of prose.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean)) {
    if (paragraph.length > 240 || !/[\p{L}\p{N}]/u.test(paragraph)) continue
    const count = (counts.get(paragraph) ?? 0) + 1
    counts.set(paragraph, count)
    if (count >= 4) return 'The answer loops over the same paragraph. Regenerate a complete answer without repeated closing or delivery statements.'
  }
  return null
}
