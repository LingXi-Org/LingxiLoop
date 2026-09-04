import { createHash } from 'node:crypto'

export function gravatarUrlForEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  const md5 = createHash('md5').update(normalized).digest('hex')
  return `https://www.gravatar.com/avatar/${md5}?d=identicon&s=256`
}
