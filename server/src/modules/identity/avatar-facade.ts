import { storage } from '../../storage.js'
import { mirrorIdentityAvatar } from './avatar-infrastructure.js'

export function mirrorTrustedIdentityAvatar(userId: string, providerUrl: string | null): Promise<string | null> {
  return mirrorIdentityAvatar(storage, userId, providerUrl)
}
