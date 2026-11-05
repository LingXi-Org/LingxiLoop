// Qualification tripwires only, never production answer filtering or a complete
// semantic judge. Retained/manual review is required even when all are true.
export function completeT11Table(text: string) {
  return [0, 64, 96, 112].every(octet => new RegExp(`192\\.168\\.10\\.${octet}(?!\\d)`).test(text))
    || text.split('\n').filter(line => /192\.168\.10\.\d/.test(line) && /\|/.test(line)).length >= 4
}

export function ipv4HostBitClaims(text: string) {
  return text.split(/\n\s*\n/).flatMap(paragraph => {
    const bits = [...paragraph.matchAll(/(\d{1,2})\s*位主机位/g)]
    const prefixes = [...paragraph.matchAll(/(?:掩码(?:变成|是|为)?|前缀(?:长度)?(?:是|为)?)[^/\n]{0,12}\/(\d{1,2})(?!\d)/g)]
    // Do not guess a correspondence across several examples or quoted mistakes.
    if (bits.length !== 1 || prefixes.length !== 1) return []
    const hostBits = Number(bits[0]![1]), statedPrefix = Number(prefixes[0]![1])
    return [{ hostBits, statedPrefix, expectedPrefix: 32 - hostBits,
      consistent: hostBits >= 0 && hostBits <= 32 && statedPrefix === 32 - hostBits }]
  })
}

export function t11ResponseChecks(group: 'A' | 'B' | 'demonstration', text: string) {
  const arithmetic = ipv4HostBitClaims(text)
  return { gates: {
    fullTableBoundary: completeT11Table(text) === (group === 'demonstration'),
    learnerAddressed: (group === 'A' ? /你|请|试/ : /你|请/).test(text),
    explicitHostBitClaimsConsistent: arithmetic.every(claim => claim.consistent),
    ...(group === 'B' ? {
      sampleMentioned: /样例|示例|例子/.test(text),
      testingMentioned: /连通|ping|测试|验证/i.test(text),
      predictionMentioned: /预测|预期|预计/.test(text),
      diagnosisMentioned: /异常|错误|故障|不通|失败/.test(text),
      learnerAskedForTest: /(?:你|请)[^。！？\n]{0,80}(?:提出|设计|写出|制定|给出|安排)[^。！？\n]{0,40}(?:测试|验证|ping)/i.test(text),
    } : {}),
  }, arithmetic, semanticAcceptance: 'manual-review-required' as const }
}
