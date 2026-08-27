export interface SensitiveActionOptions {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'destructive' | 'warning'
}

interface SensitiveActionRequestBase extends SensitiveActionOptions {
  id: number
  settled: boolean
}

export interface SensitiveConfirmRequest extends SensitiveActionRequestBase {
  kind: 'confirm'
  resolve: (confirmed: boolean) => void
}

export interface SensitiveInputRequest extends SensitiveActionRequestBase {
  kind: 'input'
  inputLabel: string
  inputDefaultValue?: string
  inputPlaceholder?: string
  inputRequired?: boolean
  resolve: (value: string | null) => void
}

export type SensitiveActionRequest = SensitiveConfirmRequest | SensitiveInputRequest

type SensitiveActionListener = (request: SensitiveActionRequest) => void

let sequence = 0
let listener: SensitiveActionListener | null = null
const backlog: SensitiveActionRequest[] = []

export function confirmSensitiveAction(options: SensitiveActionOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const request: SensitiveActionRequest = {
      ...options,
      id: ++sequence,
      settled: false,
      kind: 'confirm',
      resolve,
    }
    if (listener) listener(request)
    else backlog.push(request)
  })
}

export function promptSensitiveAction(
  options: SensitiveActionOptions & {
    inputLabel: string
    inputDefaultValue?: string
    inputPlaceholder?: string
    inputRequired?: boolean
  },
): Promise<string | null> {
  return new Promise((resolve) => {
    const request: SensitiveActionRequest = {
      ...options,
      id: ++sequence,
      settled: false,
      kind: 'input',
      resolve,
    }
    if (listener) listener(request)
    else backlog.push(request)
  })
}

export function subscribeSensitiveActions(nextListener: SensitiveActionListener): () => void {
  listener = nextListener
  while (backlog.length > 0) nextListener(backlog.shift()!)
  return () => {
    if (listener === nextListener) listener = null
  }
}
