import OpenAI from 'openai'
import { Factuality } from 'autoevals'
import { z } from 'zod'
import { EvaluationError, ModelError, hash, zeroUsage, addUsage, type Usage, type EvalTarget, type Judge } from './contracts.js'
import { span, traceId, modelScope } from './telemetry.js'

export const modelConfigSchema = z.object({
  baseURL: z.string().url().refine(value => {
    const u = new URL(value)
    return !u.username && !u.password && !u.search && !u.hash && (u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)))
  }),
  model: z.string().min(1).max(200), apiKey: z.string().min(1).refine(v => !v.includes('<secret>')),
  inputCnyPerMillion: z.number().finite().nonnegative(), outputCnyPerMillion: z.number().finite().nonnegative(),
  maxTokens: z.number().int().min(1).max(32768), timeoutMs: z.number().int().min(100).max(600000),
}).strict()
export type ModelConfig = z.infer<typeof modelConfigSchema>
export function configFromEnv(role: 'CANDIDATE' | 'JUDGE', env = process.env): ModelConfig {
  const prefix = `EVAL_${role}_`
  const number = (name: string) => env[prefix + name]?.trim() ? Number(env[prefix + name]) : NaN
  const parsed = modelConfigSchema.safeParse({
    baseURL: env[prefix + 'BASE_URL'], model: env[prefix + 'MODEL'], apiKey: env[prefix + 'API_KEY'],
    inputCnyPerMillion: number('INPUT_CNY_PER_MILLION'), outputCnyPerMillion: number('OUTPUT_CNY_PER_MILLION'),
    maxTokens: number('MAX_TOKENS'), timeoutMs: number('TIMEOUT_MS'),
  })
  if (!parsed.success) throw new EvaluationError(`invalid_${role.toLowerCase()}_config`)
  return parsed.data
}
export function publicConfig(config: ModelConfig) {
  const { apiKey: _secret, ...publicFields } = config
  return publicFields
}

function clientFor(config: ModelConfig, role: 'candidate' | 'judge', signal: AbortSignal, requestId: string, accounting: { usage: Usage }) {
  return new OpenAI({
    apiKey: config.apiKey, baseURL: config.baseURL, maxRetries: 0, timeout: config.timeoutMs,
    organization: null, project: null, logLevel: 'off',
    fetch: async (url, init) => {
      const scope = modelScope.getStore()
      const call = scope ? span(role === 'judge' ? 'eval.judge' : 'eval.model', traceId(), undefined,
        [{ traceId: scope.traceId, spanId: scope.parentSpanId }]) : undefined
      let failure: string | undefined
      let used = zeroUsage()
      const started = Date.now()
      try {
        const response = await fetch(url, { ...init, redirect: 'error',
          headers: { ...Object.fromEntries(new Headers(init?.headers)), 'X-Eval-Request-Id': requestId },
          signal: AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs), ...(init?.signal ? [init.signal] : [])]),
        })
        if (!response.ok) { await response.body?.cancel(); throw new EvaluationError(`http_${response.status}`) }
        // Bound the entire provider body before the SDK or Autoevals parses it.
        const reader = response.body?.getReader()
        if (!reader) throw new EvaluationError('empty_model_response')
        const chunks: Uint8Array[] = []
        let bytes = 0
        try {
          while (true) {
            const part = await reader.read()
            if (part.done) break
            bytes += part.value.byteLength
            if (bytes > 1_048_576) throw new EvaluationError('model_response_too_large')
            chunks.push(part.value)
          }
        } finally { await reader.cancel().catch(() => {}) }
        const body = Buffer.concat(chunks).toString('utf8')
        const decoded = JSON.parse(body)
        const usage = z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative() }).safeParse(decoded.usage)
        if (!usage.success) throw new EvaluationError('missing_model_usage')
        used = { inputTokens: usage.data.prompt_tokens, outputTokens: usage.data.completion_tokens,
          costCny: (usage.data.prompt_tokens * config.inputCnyPerMillion + usage.data.completion_tokens * config.outputCnyPerMillion) / 1_000_000 }
        accounting.usage = addUsage(accounting.usage, used)
        return new Response(body, { status: response.status, headers: response.headers })
      } catch (error) {
        failure = error instanceof EvaluationError ? error.code : signal.aborted ? 'cancelled' : 'model_transport_error'
        throw new ModelError(failure, accounting.usage)
      } finally {
        if (scope && call) scope.telemetry.emit(call.end({
          'eval.run.id': scope.runId, 'eval.case.id': scope.caseId, 'eval.sample.index': scope.sample,
          'eval.role': role, 'gen_ai.request.model': config.model, 'server.address': new URL(config.baseURL).hostname,
          'gen_ai.usage.input_tokens': used.inputTokens, 'gen_ai.usage.output_tokens': used.outputTokens,
          'eval.cost.cny': used.costCny, 'eval.latency.ms': Date.now() - started,
        }, failure))
      }
    },
  })
}

export function candidateTarget(raw: ModelConfig): EvalTarget {
  const config = modelConfigSchema.parse(raw)
  return {
    identity: { id: 'candidate-model', version: '1', fingerprint: hash(publicConfig(config)) },
    async execute(request) {
      const accounting = { usage: zeroUsage() }
      try {
        const client = clientFor(config, 'candidate', request.signal, request.requestId, accounting)
        const result = await client.chat.completions.create({ model: config.model,
          messages: [{ role: 'user', content: request.input }], temperature: 0, seed: request.seed, max_tokens: config.maxTokens }, { signal: request.signal })
        const choice = result.choices[0]
        if (choice?.finish_reason !== 'stop' || typeof choice.message.content !== 'string') throw new EvaluationError('candidate_incomplete_output')
        return { output: choice.message.content, usage: accounting.usage }
      } catch (error) { throw new ModelError(error instanceof EvaluationError ? error.code : 'candidate_api_error', accounting.usage) }
    },
  }
}

export function semanticJudge(raw: ModelConfig): Judge {
  const config = modelConfigSchema.parse(raw)
  return {
    fingerprint: hash({ ...publicConfig(config), engine: 'autoevals@0.3.0/Factuality', useCoT: false }),
    async grade(input, output, expected, signal, requestId) {
      const accounting = { usage: zeroUsage() }
      try {
        if (globalThis.__inherited_braintrust_wrap_openai) throw new EvaluationError('ambient_judge_tracing_forbidden')
        const client = clientFor(config, 'judge', signal, requestId, accounting)
        // Autoevals publishes CJS OpenAI types; the ESM client is the same SDK at runtime.
        const result = await Factuality({ client: client as unknown as NonNullable<Parameters<typeof Factuality>[0]['client']>, model: config.model, input, output, expected,
          temperature: 0, maxTokens: config.maxTokens, useCoT: false })
        if (result.error || result.score === null || !Number.isFinite(result.score) || result.score < 0 || result.score > 1) throw new EvaluationError('invalid_judge_score')
        return { score: result.score, usage: accounting.usage }
      } catch (error) { throw new ModelError(error instanceof EvaluationError ? error.code : 'judge_api_error', accounting.usage) }
    },
  }
}
