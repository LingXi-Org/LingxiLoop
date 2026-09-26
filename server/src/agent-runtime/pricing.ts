import type { ModelUsage } from '@lyyzka/lingxios/worker'

// Standard CN rates checked at https://siliconflow.cn/pricing (2026-09-26); invoices remain authoritative.
export function siliconFlowPricing(usdCny: number, model: 'deepseek-ai/DeepSeek-V4-Flash' | 'zai-org/GLM-5.2' = 'deepseek-ai/DeepSeek-V4-Flash') {
  if (!Number.isFinite(usdCny) || usdCny <= 0) throw new Error('SILICONFLOW_USD_CNY_RATE must be positive')
  return { currency: 'CNY' as const,...(model === 'zai-org/GLM-5.2'
    ? {inputPerMillion:8,cachedInputPerMillion:2,outputPerMillion:28}
    : {inputPerMillion:3,cachedInputPerMillion:0.3,outputPerMillion:9}),usdCny }
}
export function siliconFlowCost(usage: ModelUsage,pricing: ReturnType<typeof siliconFlowPricing>) {
  const { inputTokens,outputTokens,cachedInputTokens }=usage
  if (!usage.available || ![inputTokens,outputTokens,cachedInputTokens ?? 0].every(value=>Number.isSafeInteger(value) && value>=0)
    || (cachedInputTokens ?? 0)>inputTokens) throw new Error('invalid measured model usage')
  const costCny=((inputTokens-(cachedInputTokens ?? 0))*pricing.inputPerMillion+(cachedInputTokens ?? 0)*pricing.cachedInputPerMillion
    +outputTokens*pricing.outputPerMillion)/1_000_000
  return { costCny,costUsd: costCny/pricing.usdCny,cachedUsageAvailable: cachedInputTokens !== undefined }
}
