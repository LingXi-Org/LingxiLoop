import type { TraceMoney,TraceSpan } from './runTrace'

/** Original currencies remain separate. Never apply today's FX to old calls. */
export function traceCostTotals(calls: readonly TraceSpan[]): TraceMoney[]|undefined {
  if (!calls.some(call=>call.costBreakdown?.length)) return undefined
  const totals = new Map<TraceMoney['currency'],TraceMoney>()
  for (const call of calls) {
    const amounts = call.costBreakdown ?? (call.cost === null ? [] : [{ currency: 'USD' as const,amount: call.cost,estimated: call.costEstimated }])
    for (const amount of amounts) {
      const previous = totals.get(amount.currency)
      totals.set(amount.currency,{ ...amount,amount: (previous?.amount ?? 0)+amount.amount,estimated: !!(previous?.estimated || amount.estimated) })
    }
  }
  return [...totals.values()].sort((a,b)=>a.currency.localeCompare(b.currency))
}

export function formatTraceCost(span: TraceSpan): string {
  if (span.costBreakdown?.length) return `${span.cost === null ? '已计' : ''}${span.costBreakdown.map(item=>
    `${item.estimated ? '约 ' : ''}${item.currency === 'CNY' ? '¥' : '$'}${item.amount.toLocaleString('en-US',{maximumFractionDigits: 10})} ${item.currency}`).join(' + ')}`
  return span.cost === null && span.knownCost === undefined ? '—'
    : `${span.cost === null ? '已计' : ''}${span.costEstimated ? '约 ' : ''}$${(span.cost ?? span.knownCost)!.toLocaleString('en-US',{maximumFractionDigits: 8})}`
}

export function formatTracePricing(span: TraceSpan): string|undefined {
  const price = span.costPricing
  if (!price) return undefined
  return `记录计价：CNY ¥${(price.inputPerMillion/1000).toFixed(6)} / 千输入 tokens`
    + (price.outputPerMillion ? `，¥${(price.outputPerMillion/1000).toFixed(6)} / 千输出 tokens` : '')
    + (price.version ? `（${price.version}）` : '（历史冻结快照）')
}
