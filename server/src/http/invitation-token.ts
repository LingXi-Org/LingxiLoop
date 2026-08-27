import { createHash, randomBytes } from 'node:crypto'

const INVITATION_TOKEN_BYTES = 32

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

export function generateInvitationToken(): string {
  return randomBytes(INVITATION_TOKEN_BYTES).toString('base64url')
}
