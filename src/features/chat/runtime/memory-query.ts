import { QueryClient } from '@tanstack/react-query'
import { registerAuthTeardown } from '@/stores/authTeardown'

// This feature is also rendered in standalone history/quoted-message runtimes.
// MemoryTool owns the official provider; no application-wide provider is required.
export const memoryQueryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } })
registerAuthTeardown(() => {
  void memoryQueryClient.cancelQueries()
  memoryQueryClient.clear()
})
