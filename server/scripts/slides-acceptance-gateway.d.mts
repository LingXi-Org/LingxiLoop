import type { Miniflare } from 'miniflare'

export function gatewayFixture(options: {
  origin: string
  userId: string
  gatewaySecret: string
}): Promise<{ worker: Miniflare; url: string; cookie: string; email: string }>
