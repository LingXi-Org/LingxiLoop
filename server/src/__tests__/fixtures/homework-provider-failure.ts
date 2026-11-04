/** Safe metadata only: never serialize an SDK error, headers or request body. */
export function homeworkProviderFailure(error: unknown, observedAt: number) {
  const value = error && typeof error === 'object' ? error as { status?: unknown; name?: unknown; headers?: unknown } : {}
  const status = typeof value.status === 'number' ? value.status : null
  const headers = value.headers && typeof value.headers === 'object' && 'get' in value.headers && typeof value.headers.get === 'function'
    ? value.headers as Pick<Headers, 'get'> : null
  const integer = (name: string) => {
    const text = headers?.get(name)
    if (!text || !/^\d{1,15}$/.test(text)) return null
    const number = Number(text)
    return Number.isSafeInteger(number) ? number : null
  }
  const milliseconds = headers?.get('retry-after-ms'), retryAfter = headers?.get('retry-after')
  let retryAfterMs: number | null = null
  if (milliseconds && /^\d{1,12}(?:\.\d+)?$/.test(milliseconds)) retryAfterMs = Math.ceil(Number(milliseconds))
  else if (retryAfter && /^\d{1,9}$/.test(retryAfter)) retryAfterMs = Number(retryAfter) * 1000
  else if (retryAfter && /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(retryAfter)) {
    const at = Date.parse(retryAfter)
    if (Number.isFinite(at)) retryAfterMs = Math.max(0, at - observedAt)
  }
  return { httpStatus: status === null ? 'unavailable' : String(status),
    category: value.name === 'APITimeoutError' ? 'timeout' : status === null ? 'connection' : 'http',
    observedAt: new Date(observedAt).toISOString(), retryAfterMs,
    retryNotBefore: retryAfterMs === null ? null : new Date(observedAt + retryAfterMs).toISOString(),
    limitRequests: integer('x-ratelimit-limit-requests'), remainingRequests: integer('x-ratelimit-remaining-requests'),
    limitTokens: integer('x-ratelimit-limit-tokens'), remainingTokens: integer('x-ratelimit-remaining-tokens'),
    // A 429 always ends this run. Resuming requires a known expired cooldown AND
    // available authorized budget; no guessed one-second retry or reset time.
    rateLimited: status === 429,
    recovery: status === 429 ? 'confirm-provider-reset-and-available-budget-before-a-new-run' : null }
}

/** Local qualification budget only; no product/runtime quota or provider change. */
export function homeworkLivePlan(input: { caseSet?: string; repeats?: string; maxProviderCalls?: string }) {
  const caseSet = input.caseSet ?? 'full', repeats = Number(input.repeats ?? '2')
  if (!['ab', 'full'].includes(caseSet) || ![1, 2].includes(repeats)) throw new Error('Use caseSet=ab|full and repeats=1|2')
  const maxProviderCalls = Number(input.maxProviderCalls)
  const minimumCalls = repeats * 4 + (caseSet === 'full' ? 3 : 0)
  if (!Number.isSafeInteger(maxProviderCalls) || maxProviderCalls < minimumCalls || maxProviderCalls > 22) {
    throw new Error(`An explicit available call budget between ${minimumCalls} and 22 is required before live qualification`)
  }
  return { caseSet, repeats, maxProviderCalls, minimumCalls }
}
