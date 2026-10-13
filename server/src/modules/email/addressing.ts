import { randomUUID } from 'node:crypto'
import { env } from '../../env.js'

export function formatAddress(addr: string, name: string | null): string {
  if (!name) return addr
  const safeName = name.replace(/"/g, '\\"')
  return /["<>,;:@()[\]\\]/.test(name) ? `"${safeName}" <${addr}>` : `${safeName} <${addr}>`
}
export function mintMessageId(): string {
  const local = `${Date.now().toString(36)}-${randomUUID().replace(/-/g, '').slice(0, 22)}`
  return `${local}@${env.EMAIL_DOMAIN || 'lingxiloop.local'}`
}
