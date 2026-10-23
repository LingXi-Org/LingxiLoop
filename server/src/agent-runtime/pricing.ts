import type { ModelUsage } from '@lyyzka/lingxios/worker'

// CN rates per million tokens from https://www.siliconflow.cn/pricing (2026-10-22).
// The public component metadata explicitly uses realTimePriceCnyUnit / K tokens.
// Existing model identities remain distinct; stored ledger records are never repriced.
const rates = {
  'deepseek-ai/DeepSeek-V4.1-Flash': { inputPerMillion: 2, cachedInputPerMillion: 0.04, outputPerMillion: 8 },
  'Pro/BAAI/bge-m3': { inputPerMillion: 0.07, cachedInputPerMillion: 0.07, outputPerMillion: 0 },
  'BAAI/bge-m3': { inputPerMillion: 0, cachedInputPerMillion: 0, outputPerMillion: 0 },
  'Qwen/Qwen3-Embedding-8B': { inputPerMillion: 0.28, cachedInputPerMillion: 0.28, outputPerMillion: 0 },
  'deepseek-ai/DeepSeek-V4-Flash': { inputPerMillion: 3, cachedInputPerMillion: 0.3, outputPerMillion: 9 },
  'zai-org/GLM-5.2': { inputPerMillion: 8, cachedInputPerMillion: 2, outputPerMillion: 28 },
  'zai-org/GLM-5.3-Flash': { inputPerMillion: 0.8, cachedInputPerMillion: 0.23, outputPerMillion: 2.8 },
}
export function isSiliconFlowModel(model: string): model is keyof typeof rates {
  return Object.hasOwn(rates, model)
}
export function siliconFlowPricing(usdCny: number, model: keyof typeof rates = 'deepseek-ai/DeepSeek-V4.1-Flash', billedAt?: number) {
  if (!Number.isFinite(usdCny) || usdCny <= 0) throw new Error('SILICONFLOW_USD_CNY_RATE must be positive')
  if (billedAt !== undefined && (!Number.isFinite(billedAt) || billedAt < 0 || !Number.isFinite(new Date(billedAt).getTime()))) throw new Error('invalid billing timestamp')
  // Admission and native observations without an exact request timestamp use the
  // conservative standard tariff. Product calls freeze their real issued time;
  // reading an old call never selects a tariff from the current wall clock.
  const hour = billedAt === undefined ? null : new Date(billedAt + 8 * 60 * 60 * 1000).getUTCHours()
  const offPeak = model === 'deepseek-ai/DeepSeek-V4.1-Flash' && hour !== null && hour >= 2 && hour < 8
  return { currency: 'CNY' as const, version: 'siliconflow-cn-2026-10-22' as const, ...rates[model],
    ...(offPeak ? { inputPerMillion: 1, cachedInputPerMillion: 0.02, outputPerMillion: 4 } : {}), usdCny,
    ...(model === 'deepseek-ai/DeepSeek-V4.1-Flash' ? {
      tariff: billedAt === undefined ? 'standard-peak-estimate' : offPeak ? 'off-peak' : 'peak',
      billingTimezone: 'Asia/Shanghai', ...(billedAt === undefined ? {} : { billedAt }),
    } : {}),
    billingItem: model === 'Pro/BAAI/bge-m3' ? 'pro/baai/bge-m3.online.input-tokens' : undefined,
  }
}
export function siliconFlowPricingForModel(baseUrl: string, model: string, production: boolean, billedAt?: number) {
  if (!isSiliconFlowModel(model) || new URL(baseUrl).hostname !== 'api.siliconflow.cn') return undefined
  const rate = process.env.SILICONFLOW_USD_CNY_RATE?.trim()
  if (!rate && production) throw new Error('SILICONFLOW_USD_CNY_RATE is required in production')
  return siliconFlowPricing(Number(rate || 7), model, billedAt)
}
export function siliconFlowCost(usage: ModelUsage,pricing: ReturnType<typeof siliconFlowPricing>) {
  const { inputTokens,outputTokens,cachedInputTokens }=usage
  if (!usage.available || ![inputTokens,outputTokens,cachedInputTokens ?? 0].every(value=>Number.isSafeInteger(value) && value>=0)
    || (cachedInputTokens ?? 0)>inputTokens) throw new Error('invalid measured model usage')
  const costCny=((inputTokens-(cachedInputTokens ?? 0))*pricing.inputPerMillion+(cachedInputTokens ?? 0)*pricing.cachedInputPerMillion
    +outputTokens*pricing.outputPerMillion)/1_000_000
  return { costCny,costUsd: costCny/pricing.usdCny,cachedUsageAvailable: cachedInputTokens !== undefined }
}
