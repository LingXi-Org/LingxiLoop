import { http } from '@/api/core/http'
import type { ApiInvitation, ApiInvitationWithToken, ApiInvitationPreview, ApiInvitationAccept, ApiCompanyProfile, ApiCompanyMember } from './contracts'

export const companiesApi = {
  listCompanies: () =>
    http<Array<{ id: string; name: string; slug: string; createdAt: string; role: string }>>('/companies'),
  createCompany: (name: string) =>
    http<{ id: string; name: string; slug: string; role: string }>('/companies', {
      method: 'POST', body: JSON.stringify({ name }),
    }),
  getCompany: (companyId: string) => http<ApiCompanyProfile>(`/companies/${encodeURIComponent(companyId)}`),
  updateCompany: (companyId: string, input: { name?: string; description?: string }) =>
    http<ApiCompanyProfile>(`/companies/${encodeURIComponent(companyId)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  listCompanyMembers: (companyId: string) =>
    http<ApiCompanyMember[]>(`/companies/${encodeURIComponent(companyId)}/members`),
  updateCompanyMember: (companyId: string, userId: string, role: 'admin' | 'member') =>
    http<{ ok: true; userId: string; role: string }>(`/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeCompanyMember: (companyId: string, userId: string) =>
    http<{ ok: true }>(`/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  listInvitations: (companyId: string) =>
    http<ApiInvitation[]>(`/companies/${encodeURIComponent(companyId)}/invitations`),
  createInvitation: (companyId: string, input: {
    email?: string | null
    role?: 'member' | 'admin'
    note?: string | null
    multiUse?: boolean
    maxUses?: number
    /** Ask the server to send the invitation email on the inviter's
     *  behalf. Requires `email`; delivery failures reject the request. */
    sendEmail?: boolean
  }) =>
    http<ApiInvitationWithToken>(`/companies/${encodeURIComponent(companyId)}/invitations`, {
      method: 'POST', body: JSON.stringify(input),
    }),
  revokeInvitation: (companyId: string, inviteId: string) =>
    http<{ ok: boolean; revoked: boolean }>(
      `/companies/${encodeURIComponent(companyId)}/invitations/${encodeURIComponent(inviteId)}`,
      { method: 'DELETE' },
    ),
  previewInvitation: (token: string) =>
    http<ApiInvitationPreview>(`/invitations/${encodeURIComponent(token)}`),
  acceptInvitation: (token: string) =>
    http<ApiInvitationAccept>(`/invitations/${encodeURIComponent(token)}/accept`, {
      method: 'POST', body: JSON.stringify({}),
    })
}
