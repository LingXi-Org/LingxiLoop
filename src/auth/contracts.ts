export interface AuthCompany {
  id: string
  name: string
  slug: string
  role: 'teacher' | 'student'
  isAdmin: boolean
  status: CompanyStatus
}

export type CompanyStatus =
  | 'TRIAL' | 'ACTIVE' | 'GRACE_PERIOD' | 'READ_ONLY'
  | 'OFFBOARDED' | 'RETENTION' | 'ARCHIVED' | 'DELETED'

export interface AuthUser {
  avatarUrl?: string | null
  avatarSeed?: string | null
  id: string
  email: string
  name: string
  emailVerified?: boolean
  providers?: string[]
}

export interface ServerCapabilities {
  invitationEmail: boolean
}

export interface AuthMeResponse {
  user: AuthUser & { emailVerified: boolean; providers: string[] }
  companies: AuthCompany[]
  activeCompanyId: string
  serverCapabilities: ServerCapabilities
}

export interface AuthStartOptions {
  inviteToken?: string | null
  inviteKind?: 'company' | 'project' | null
  returnUrl?: string | null
}

/** Public registration contract. Messages never depend on provider prose or raw bodies. */
export const registrationMessages: Record<string, string> = {
  INVALID_REGISTRATION: '请填写有效的邮箱、姓名和密码。',
  INVITATION_REQUIRED: '请打开有效邀请链接继续加入，或联系邀请人。',
  INVITATION_REJECTED: '邀请无效、已过期、已撤销或与邮箱不匹配，请联系邀请人。',
  INVITATION_CONFLICT: '请使用原邀请完成注册，再接受新的邀请。',
  REGISTRATION_FORBIDDEN: '暂时无法完成加入，请联系管理员。',
  EMAIL_NOT_VERIFIED: '请先继续验证邮箱，再登录。',
  REGISTRATION_INCOMPLETE: '邮箱已验证，加入尚未完成，请继续完成加入。',
  REGISTRATION_RESULT_UNKNOWN: '尚未确认加入结果，请稍后继续完成加入。',
  REGISTRATION_UNAVAILABLE: '服务暂时不可用，请稍后重试。',
  RATE_LIMITED: '操作过于频繁，请稍后再试。',
  TOO_MANY_REQUESTS: '操作过于频繁，请稍后再试。',
  TOO_MANY_ATTEMPTS: '尝试次数过多，请稍后重新发送验证码。',
  INVALID_OTP: '验证码不正确，请检查后重试。',
  OTP_EXPIRED: '验证码已过期，请重新发送。',
  OTP_NOT_FOUND: '验证码已失效，请重新发送。',
  VERIFICATION_FAILED: '安全验证失败，请重新完成验证。',
  MISSING_RESPONSE: '请完成安全验证。',
  SERVICE_UNAVAILABLE: '安全验证服务暂时不可用，请稍后重试。',
  CAPTCHA_VERIFICATION_FAILED: '安全验证失败，请重新完成验证。',
  CAPTCHA_RESPONSE_MISSING: '请完成安全验证。',
  INVALID_EMAIL_OR_PASSWORD: '邮箱或密码不正确。',
  INVALID_PASSWORD: '密码不正确。',
  PASSWORD_TOO_SHORT: '密码至少需要 8 个字符。',
  PASSWORD_TOO_LONG: '密码过长，请缩短后重试。',
  INVALID_EMAIL: '请输入有效的邮箱。',
}
export function registrationMessage(code: string | undefined, status: number): string {
  return (code && registrationMessages[code]) || (status === 429 ? registrationMessages.RATE_LIMITED : status >= 500 ? registrationMessages.REGISTRATION_UNAVAILABLE : '暂时无法完成请求，请检查输入后重试。')
}
