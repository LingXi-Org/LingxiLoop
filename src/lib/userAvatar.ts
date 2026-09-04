import { generatedUserAvatarUrl } from './generatedAvatar'

const REMOTE_GENERATED_AVATAR = /^https:\/\/(?:api\.dicebear\.com|www\.gravatar\.com)\//

export function resolveUserAvatarUrl(avatarUrl: string | null | undefined, seed: string): string {
  const configured = avatarUrl?.trim()
  return configured && !REMOTE_GENERATED_AVATAR.test(configured)
    ? configured
    : generatedUserAvatarUrl(seed)
}
