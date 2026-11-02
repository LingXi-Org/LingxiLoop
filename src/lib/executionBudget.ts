import type { BudgetDimension } from '@lyyzka/lingxios'

export const executionBudgetMessages: Record<BudgetDimension, string> = {
  calls: '本轮模型调用次数已达上限，剩余工作未能继续。',
  tokens: '本轮累计用量加上后续调用所需预留已达上限，剩余工作未能继续。',
  cost: '本轮费用加上后续调用预留费用已达上限，剩余工作未能继续。',
  deadline: '本轮累计执行时长已达上限，剩余工作未能继续。',
  reservation: '本轮共享预算已被待执行任务占用，剩余工作未能继续。',
}

/** Only the published runtime's structured diagnostic establishes a dimension. */
export function readExecutionBudgetDimension(value: unknown): BudgetDimension | undefined {
  if (!value || typeof value !== 'object' || Reflect.get(value, 'code') !== 'budget_limit') return
  const dimension = Reflect.get(value, 'dimension')
  return typeof dimension === 'string' && Object.hasOwn(executionBudgetMessages, dimension) ? dimension as BudgetDimension : undefined
}
