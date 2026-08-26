import { toast } from '@/components/ui/toast'

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
    loading: {
      title: messages.loading,
      description: messages.description,
      type: 'loading',
      timeout: 0,
    },
    success: (value) => ({
      title: typeof messages.success === 'function' ? messages.success(value) : messages.success,
      description: messages.description,
      type: 'success',
    }),
    error: (error) => ({
      title: typeof messages.error === 'function'
        ? messages.error(error)
        : messages.error ?? '操作失败',
      description: messages.error ? errorMessage(error) : undefined,
      type: 'error',
      priority: 'high',
    }),
  })
}

export function notifyAction(options: {
  title: string
  description?: string
  type?: 'success' | 'info' | 'warning' | 'error' | 'loading'
}) {
  return toast.add({ ...options, type: options.type ?? 'success' })
}
