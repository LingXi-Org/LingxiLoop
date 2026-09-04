/** Long-lived human identity and account lifecycle state. */
export interface User {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  emailVerifiedAt: string | null
  createdAt: string
  lastLoginAt: string | null
  deletedAt: string | null
  suspendedAt: string | null
  suspensionReason: string | null
  suspendedBy: string | null
}
