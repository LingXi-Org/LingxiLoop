import { QueryClient } from '@tanstack/react-query'
import { registerAuthTeardown } from '@/stores/authTeardown'

export const materialsQueryClient = new QueryClient({ defaultOptions: { queries: {
  retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always',
} } })
registerAuthTeardown(() => materialsQueryClient.clear())
