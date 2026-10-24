/** Student requests describe the help wanted; provider effort stays in runtime configuration. */
export const LEARNING_HELP = [
  { id: 'hint', label: '给我一点提示', prompt: '请根据我的尝试，先给一条简短线索，让我自己完成下一步。' },
  { id: 'explain', label: '解释这个原理', prompt: '请解释我卡住的原理，结合一个例子，再给我一步可以独立尝试的任务。' },
  { id: 'check', label: '检查我的思路', prompt: '请检查我的思路，指出第一处需要核对的地方，让我先尝试修正。' },
] as const

export type LearningHelpIntent = typeof LEARNING_HELP[number]['id']

export function appendLearningHelp(text: string, intent: LearningHelpIntent): string {
  const prompt = LEARNING_HELP.find(item => item.id === intent)!.prompt
  return text.trim() ? `${text}\n\n${prompt}` : prompt
}
