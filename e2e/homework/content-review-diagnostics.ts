import { createHash } from 'node:crypto'

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const type = (value: unknown) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const unknownKeys = (value: Record<string, unknown> | undefined, known: string[]) =>
  value ? Object.keys(value).filter(key => !known.includes(key)).length : 0

function textField(value: unknown, sources?: string[]) {
  const text = typeof value === 'string' ? value : undefined
  return { type: type(value), chars: text?.length ?? null, sha256: text === undefined ? null : hash(text),
    nonempty: Boolean(text?.trim()), withinLimit: text !== undefined && text.length <= 2000,
    grounded: sources === undefined ? null : text !== undefined && sources.some(source => source.includes(text)) }
}

export function structuredRequestShape(request: Record<string, unknown>) {
  if (request.stream === true) return undefined
  const format = object(request.response_format)?.type
  const messages = Array.isArray(request.messages) ? request.messages : []
  return { streamType: type(request.stream), responseFormatType: type(request.response_format),
    responseFormat: format === 'json_object' || format === 'json_schema' || format === 'text' ? format : 'other',
    messageCount: messages.length, messages: messages.slice(0, 8).map(raw => {
      const message = object(raw), content = message?.content
      let parsed: unknown, jsonParsed = false
      if (message?.role === 'user' && typeof content === 'string') {
        try { parsed = JSON.parse(content); jsonParsed = true } catch { /* Shape only. */ }
      }
      const input = object(parsed)
      return { role: ['system', 'developer', 'user', 'assistant', 'tool'].includes(String(message?.role)) ? String(message?.role) : 'other',
        contentType: type(content), contentChars: typeof content === 'string' ? content.length : null,
        contentParts: Array.isArray(content) ? content.length : null, jsonParsed, parsedType: type(parsed),
        fields: Object.fromEntries(['workId', 'requestVersion', 'originalText', 'body', 'revisions', 'checklist', 'resourceChecks',
          'fileObservations', 'observations', 'findings', 'input', 'request', 'data'].map(key => [key,
          { present: Boolean(input && Object.hasOwn(input, key)), type: type(input?.[key]), count: Array.isArray(input?.[key]) ? input[key].length : null }])) }
    }) }
}

/** Observes the installed content-review contract; never returns source text or arbitrary keys. */
export function contentReviewDiagnostics(request: Record<string, unknown>, response: unknown) {
  if (object(request.response_format)?.type !== 'json_object' || request.stream || !Array.isArray(request.messages)) return undefined
  const message = request.messages.map(object).find(item => item?.role === 'user' && typeof item.content === 'string')
  if (!message || typeof message.content !== 'string') return undefined
  let input: Record<string, unknown> | undefined
  try { input = object(JSON.parse(message.content)) } catch { return undefined }
  if (!input || typeof input.workId !== 'string' || typeof input.originalText !== 'string' || typeof input.body !== 'string'
    || !Array.isArray(input.revisions)) return undefined
  const revisions = input.revisions.map(object).filter(item => typeof item?.text === 'string')
  const texts = [input.originalText, ...revisions.map(item => item!.text as string)]
  const humanTexts = [input.originalText, ...revisions.filter(item => object(item!.author)?.kind !== 'agent').map(item => item!.text as string)]
  const choice = object(Array.isArray(object(response)?.choices) ? (object(response)!.choices as unknown[])[0] : undefined)
  const content = object(choice?.message)?.content
  let parsed: unknown, responseJson = false
  if (typeof content === 'string') {
    try { parsed = JSON.parse(content); responseJson = true } catch { /* Record only the malformed shape. */ }
  }
  const value = object(parsed)
  if (Object.hasOwn(input, 'findings')) {
    const findings = Array.isArray(input.findings) ? input.findings : []
    const knownIds = new Set(findings.map(raw => object(raw)?.id).filter(id => typeof id === 'string'))
    const deferredValue = value?.deferred, entries = Array.isArray(deferredValue) ? deferredValue : []
    const ids = entries.slice(0, 32).map(raw => object(raw)?.id)
    const items = entries.slice(0, 32).map((raw, index) => {
      const item = object(raw), id = { ...textField(item?.id), known: typeof item?.id === 'string' && knownIds.has(item.id),
        unique: typeof item?.id === 'string' && ids.indexOf(item.id) === index && ids.lastIndexOf(item.id) === index }
      const quote = textField(item?.quote, humanTexts), reason = textField(item?.reason)
      const unknownKeyCount = unknownKeys(item, ['id', 'quote', 'reason'])
      return { type: type(raw), unknownKeyCount, id, quote, reason,
        accepted: unknownKeyCount === 0 && id.known && id.unique && id.nonempty && id.withinLimit
          && quote.nonempty && quote.withinLimit && quote.grounded === true && reason.nonempty && reason.withinLimit }
    })
    const accepted = Array.isArray(deferredValue) && entries.length <= 32 && items.every(item => item.accepted)
    const unknownKeyCount = unknownKeys(value, ['deferred'])
    return { contract: 'lingxios-3.3.11-content-review-deferral' as const,
      workIdSha256: hash(input.workId), inputSha256: hash(message.content), bodySha256: hash(input.body),
      requestVersion: Number.isSafeInteger(input.requestVersion) ? input.requestVersion as number : null,
      revisionCount: input.revisions.length, findingCount: findings.length, responseJson, finishedNormally: choice?.finish_reason === 'stop',
      responseSha256: typeof content === 'string' ? hash(content) : null, valueType: type(parsed), unknownKeyCount,
      deferred: { type: type(deferredValue), count: Array.isArray(deferredValue) ? entries.length : null, items, accepted },
      matchesInstalledContract: responseJson && unknownKeyCount === 0 && accepted }
  }
  const missingValue = value?.missing, limitationsValue = value?.limitations
  const missingEntries = Array.isArray(missingValue) ? missingValue : []
  const limitationEntries = Array.isArray(limitationsValue) ? limitationsValue : []
  const missingItems = missingEntries.slice(0, 16).map(raw => {
    const item = object(raw), quote = textField(item?.quote, texts), reason = textField(item?.reason), blockedBy = textField(item?.blockedBy, humanTexts)
    return { type: type(raw), unknownKeyCount: unknownKeys(item, ['quote', 'reason', 'blockedBy']), quote, reason, blockedBy,
      accepted: quote.nonempty && quote.withinLimit && quote.grounded === true && reason.nonempty && reason.withinLimit
        && (item?.blockedBy === undefined || blockedBy.nonempty && blockedBy.withinLimit && blockedBy.grounded === true) }
  })
  const limitationItems = limitationEntries.slice(0, 16).map(raw => {
    const item = object(raw), quote = textField(item?.quote, [input!.body as string]), reason = textField(item?.reason), requestQuote = textField(item?.requestQuote, texts)
    return { type: type(raw), unknownKeyCount: unknownKeys(item, ['quote', 'reason', 'requestQuote']), quote, reason, requestQuote,
      accepted: quote.nonempty && quote.withinLimit && quote.grounded === true && reason.nonempty && reason.withinLimit
        && (item?.requestQuote === null || requestQuote.nonempty && requestQuote.withinLimit && requestQuote.grounded === true) }
  })
  const missingAccepted = Array.isArray(missingValue) && missingEntries.length <= 16 && missingItems.every(item => item.accepted)
  const limitationsAccepted = (limitationsValue === undefined || limitationsValue === null || Array.isArray(limitationsValue))
    && limitationEntries.length <= 16 && limitationItems.every(item => item.accepted)
  return { contract: 'lingxios-3.3.6-content-review' as const, workIdSha256: hash(input.workId), inputSha256: hash(message.content), bodySha256: hash(input.body),
    requestVersion: Number.isSafeInteger(input.requestVersion) ? input.requestVersion as number : null,
    revisionCount: input.revisions.length, responseJson, finishedNormally: choice?.finish_reason === 'stop',
    responseSha256: typeof content === 'string' ? hash(content) : null, valueType: type(parsed), unknownKeyCount: unknownKeys(value, ['missing', 'limitations']),
    missing: { type: type(missingValue), count: Array.isArray(missingValue) ? missingEntries.length : null, items: missingItems, accepted: missingAccepted },
    limitations: { type: type(limitationsValue), count: Array.isArray(limitationsValue) ? limitationEntries.length : null, items: limitationItems, accepted: limitationsAccepted },
    matchesInstalledContract: responseJson && missingAccepted && limitationsAccepted }
}
