import type { RunDisplayState } from '@/lib/agentRunSnapshot'

/** The server projects this binding from the durable row, independently of history pages. */
export function hasQuestionnaireWait(custom: Record<string, unknown>): boolean {
  const view = custom.harness as RunDisplayState | undefined
  const wait = custom.questionnaireWait
  return view?.goalOutcome?.status === 'awaiting_input' && !!wait && typeof wait === 'object'
    && typeof Reflect.get(wait, 'questionId') === 'string' && Reflect.get(wait, 'questionId').length > 0
    && Reflect.get(wait, 'requestVersion') === view.requestVersion
}
