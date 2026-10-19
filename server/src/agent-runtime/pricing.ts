import type { ModelUsage } from '@lyyzka/lingxios/worker'

// Standard CN rates per million tokens. Flash checked at https://www.siliconflow.cn/pricing
// (2026-10-19); legacy rates checked 2026-09-26. Provider invoices remain authoritative.
const rates = {
  'deepseek-ai/DeepSeek-V4-Flash': { inputPerMillion: 3, cachedInputPerMillion: 0.3, outputPerMillion: 9 },
  'zai-org/GLM-5.2': { inputPerMillion: 8, cachedInputPerMillion: 2, outputPerMillion: 28 },
  'zai-org/GLM-5.3-Flash': { inputPerMillion: 0.8, cachedInputPerMillion: 0.23, outputPerMillion: 2.8 },
}
export function isSiliconFlowModel(model: string): model is keyof typeof rates {
  return Object.hasOwn(rates, model)
}
export function siliconFlowPricing(usdCny: number, model: keyof typeof rates = 'deepseek-ai/DeepSeek-V4-Flash') {
  if (!Number.isFinite(usdCny) || usdCny <= 0) throw new Error('SILICONFLOW_USD_CNY_RATE must be positive')
  return { currency: 'CNY' as const, ...rates[model], usdCny }
}
export function siliconFlowPricingForModel(baseUrl: string, model: string, production: boolean) {
  if (!isSiliconFlowModel(model) || new URL(baseUrl).hostname !== 'api.siliconflow.cn') return undefined
  const rate = process.env.SILICONFLOW_USD_CNY_RATE?.trim()
  if (!rate && production) throw new Error('SILICONFLOW_USD_CNY_RATE is required in production')
  return siliconFlowPricing(Number(rate || 7), model)
}
export function siliconFlowCost(usage: ModelUsage,pricing: ReturnType<typeof siliconFlowPricing>) {
  const { inputTokens,outputTokens,cachedInputTokens }=usage
  if (!usage.available || ![inputTokens,outputTokens,cachedInputTokens ?? 0].every(value=>Number.isSafeInteger(value) && value>=0)
    || (cachedInputTokens ?? 0)>inputTokens) throw new Error('invalid measured model usage')
  const costCny=((inputTokens-(cachedInputTokens ?? 0))*pricing.inputPerMillion+(cachedInputTokens ?? 0)*pricing.cachedInputPerMillion
    +outputTokens*pricing.outputPerMillion)/1_000_000
  return { costCny,costUsd: costCny/pricing.usdCny,cachedUsageAvailable: cachedInputTokens !== undefined }
}
