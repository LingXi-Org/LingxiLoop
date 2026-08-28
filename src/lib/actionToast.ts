import { toast } from 'sonner'

interface ActionToastMessages<T> {
  loading: string
  success: string | ((value: T) => string)
  error?: string | ((error: unknown) => string)
  description?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function toastAction<T>(promise: Promise<T>, messages: ActionToastMessages<T>): Promise<T> {
  return toast.promise(promise, {
    loading: messages.loading,
    success: (value) => typeof messages.success === 'function' ? messages.success(value) : messages.success,
    error: (error) => typeof messages.error === 'function'
      ? messages.error(error)
      : messages.error ?? '操作失败',
    description: (value) => messages.error && value instanceof Error
      ? errorMessage(value)
      : messages.description,
  }).unwrap()
}

export function notifyAction(options: {
  title: string
  description?: string
  type?: 'success' | 'info' | 'warning' | 'error' | 'loading'
}) {
  const method = options.type ?? 'success'
  return toast[method](options.title, { description: options.description })
}
