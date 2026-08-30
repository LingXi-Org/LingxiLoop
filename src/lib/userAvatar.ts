export const DEFAULT_USER_AVATAR_URL = 'https://api.dicebear.com/10.x/marbles/svg?seed=tcyjnxy6'

export function resolveUserAvatarUrl(avatarUrl: string | null | undefined): string {
  return avatarUrl?.trim() || DEFAULT_USER_AVATAR_URL
}

