/**
 * Token → cost accounting for the triage cost-effectiveness measurement.
 *
 * The whole point of this module is to compare, HONESTLY, the cost of a small-
 * brain triage against the big-brain turn it shields. That comparison is only
 * fair when it is CACHE-AWARE: a triage runs in a fresh, cold session so EVERY
 * input token is billed at the full (uncached) rate, whereas a persistent big-
 * brain session reads most of its input from the prompt cache at ~0.1× the
 * price. So a "saving" can secretly be a loss. We price each tier separately.
 *
 * Prices are per 1M tokens, in USD, list prices. Override contracted rates via
 * the LINGXILOOP_MODEL_PRICES_JSON env (a JSON map of modelId → price); only those
 * count as `verified` — every seeded default is reported as an estimate.
 */

/** A cache-aware token breakdown for one model call. All counts are the RAW
 *  (uncached) counts as the provider reports them: `inputTokens` excludes the
 *  cached portion; `cachedInputTokens` is the cache-READ portion (cheap);
 *  `cacheCreationTokens` is the cache-WRITE portion (a premium over input). */
export interface TokenUsage {
  inputTokens: number
  cachedInputTokens: number
  cacheCreationTokens: number
  outputTokens: number
}

export interface ModelPrice {
  inPer1M: number
  cachedInPer1M: number
  cacheWritePer1M: number
  outPer1M: number
  /** true only for prices supplied by the operator (env override) — a real
   *  contracted rate. Seeded defaults are estimates and report `estimated`. */
  verified?: boolean
}

export const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0, cachedInputTokens: 0, cacheCreationTokens: 0, outputTokens: 0,
}

// Seeded prices are estimates. Nothing here is presented as authoritative: a figure is
// only `verified` (non-estimated) when the OPERATOR supplies the real contracted
// rate via LINGXILOOP_MODEL_PRICES_JSON. Everything else surfaces as an estimate.
const SEED_PRICES: Record<string, ModelPrice> = {
  'deepseek-chat':     { inPer1M: 0.28, cachedInPer1M: 0.028, cacheWritePer1M: 0.28, outPer1M: 0.42, verified: false },
  'deepseek-reasoner': { inPer1M: 0.55, cachedInPer1M: 0.14, cacheWritePer1M: 0.55, outPer1M: 2.19, verified: false },
}

// Last-resort rate for an unrecognized model: mid-tier, ALWAYS flagged estimated.
const FALLBACK_PRICE: ModelPrice = { inPer1M: 3, cachedInPer1M: 0.3, cacheWritePer1M: 3.75, outPer1M: 15, verified: false }

let envOverrides: Record<string, ModelPrice> | null = null
function overrides(): Record<string, ModelPrice> {
  if (envOverrides) return envOverrides
  envOverrides = {}
  const raw = process.env.LINGXILOOP_MODEL_PRICES_JSON
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, Partial<ModelPrice>>
      for (const [id, p] of Object.entries(parsed)) {
        envOverrides[id] = {
          inPer1M: Number(p.inPer1M ?? 0),
          cachedInPer1M: Number(p.cachedInPer1M ?? 0),
          cacheWritePer1M: Number(p.cacheWritePer1M ?? 0),
          outPer1M: Number(p.outPer1M ?? 0),
          verified: true, // operator-supplied = a real rate
        }
      }
    } catch (err) {
      console.warn('[cost] LINGXILOOP_MODEL_PRICES_JSON is not valid JSON — ignoring:', err instanceof Error ? err.message : err)
    }
  }
  return envOverrides
}

/** Resolve the price for a model id: env override (exact) → seeded exact → seeded
 *  family substring → fallback. */
export function priceFor(model: string | null | undefined): ModelPrice {
  const id = (model ?? '').toLowerCase().trim()
  if (!id) return FALLBACK_PRICE
  // Match exact ids and versioned variants of the configured global model family.
  const matches = (key: string): boolean => { const k = key.toLowerCase(); return id === k || id.includes(k) || k.includes(id) }
  const ov = overrides()
  if (ov[id]) return ov[id]
  for (const [key, price] of Object.entries(ov)) if (matches(key)) return price
  if (SEED_PRICES[id]) return SEED_PRICES[id]
  for (const [key, price] of Object.entries(SEED_PRICES)) if (matches(key)) return price
  return FALLBACK_PRICE
}

/** The full known price menu (seeded tiers + any operator env overrides), for a
 *  UI reference table so users can see exactly what each model costs. `estimated`
 *  is true for everything except operator-supplied (LINGXILOOP_MODEL_PRICES_JSON) rates. */
export function modelPriceTable(): Array<{
  model: string; inPer1M: number; cachedInPer1M: number; cacheWritePer1M: number; outPer1M: number; estimated: boolean
}> {
  const rows: Array<{ model: string; inPer1M: number; cachedInPer1M: number; cacheWritePer1M: number; outPer1M: number; estimated: boolean }> = []
  const add = (model: string, p: ModelPrice): void => {
    if (rows.some((r) => r.model === model)) return
    rows.push({ model, inPer1M: p.inPer1M, cachedInPer1M: p.cachedInPer1M, cacheWritePer1M: p.cacheWritePer1M, outPer1M: p.outPer1M, estimated: p.verified !== true })
  }
  for (const [model, p] of Object.entries(overrides())) add(model, p)
  for (const [model, p] of Object.entries(SEED_PRICES)) add(model, p)
  return rows
}

/** Cache-aware effective cost in USD for one model call. `estimated` is true when
 *  the price is a seeded guess / fallback rather than an operator-supplied rate —
 *  surface it in the UI so the dollar figure is never mistaken for a real bill. */
export function effectiveCostUsd(model: string | null | undefined, usage: TokenUsage): { usd: number; estimated: boolean } {
  const p = priceFor(model)
  const usd =
    (usage.inputTokens * p.inPer1M +
      usage.cachedInputTokens * p.cachedInPer1M +
      usage.cacheCreationTokens * p.cacheWritePer1M +
      usage.outputTokens * p.outPer1M) / 1_000_000
  return { usd, estimated: p.verified !== true }
}

/** Total cost expressed in "uncached-input-token equivalents" — a price-free way
 *  to compare calls on one scale (how many fresh input tokens this call's spend
 *  is worth at the model's own rates). Useful when the operator distrusts the $. */
export function inputEquivalentTokens(model: string | null | undefined, usage: TokenUsage): number {
  const p = priceFor(model)
  if (p.inPer1M <= 0) return usage.inputTokens + usage.cachedInputTokens + usage.cacheCreationTokens + usage.outputTokens
  const { usd } = effectiveCostUsd(model, usage)
  return Math.round((usd * 1_000_000) / p.inPer1M)
}

/** Cache-hit rate = cache-read input / total input tokens (0..1). NaN-safe → 0. */
export function cacheHitRate(usage: TokenUsage): number {
  const totalInput = usage.inputTokens + usage.cachedInputTokens
  return totalInput > 0 ? usage.cachedInputTokens / totalInput : 0
}

/** DeepSeek usage plus compatible-gateway aliases. */
interface RawUsage {
  input_tokens?: number
  output_tokens?: number
  prompt_tokens?: number
  completion_tokens?: number
  prompt_cache_hit_tokens?: number
  prompt_cache_miss_tokens?: number
  input_tokens_details?: { cached_tokens?: number }
  prompt_tokens_details?: { cached_tokens?: number }
}

/** Map DeepSeek Chat Completions usage to cache-aware TokenUsage. */
export function usageFromDeepSeek(raw: unknown): TokenUsage {
  const u = (raw ?? {}) as RawUsage
  const total = Number(u.prompt_tokens ?? u.input_tokens ?? 0)
  const cached = Number(u.prompt_cache_hit_tokens ?? u.input_tokens_details?.cached_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0)
  const miss = Number(u.prompt_cache_miss_tokens ?? Math.max(0, total - cached))
  return {
    inputTokens: Math.max(0, miss),
    cachedInputTokens: cached,
    cacheCreationTokens: 0,
    outputTokens: Number(u.completion_tokens ?? u.output_tokens ?? 0),
  }
}

/** Sum two usages (accumulate across the multiple model hops of one turn). */
export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  }
}

/** True when there's any token signal at all. */
export function hasUsage(u: TokenUsage): boolean {
  return u.inputTokens + u.cachedInputTokens + u.cacheCreationTokens + u.outputTokens > 0
}
