import { isMockImDevelopment } from '@/lib/devMode'
import { http } from '@/api/core/http'
import type { ApiInvitation, ApiInvitationWithToken, ApiInvitationPreview, ApiInvitationAccept, ApiCompanyProfile, ApiCompanyMember } from './contracts'
import { mockApiData } from './mock-data'

export const companiesApi = {
  listCompanies: () =>
    http<Array<{ id: string; name: string; slug: string; createdAt: string; role: string }>>('/companies'),
  createCompany: (name: string) =>
    http<{ id: string; name: string; slug: string; role: string }>('/companies', {
      method: 'POST', body: JSON.stringify({ name }),
    }),
  getCompany: (companyId: string) => isMockImDevelopment()
    ? Promise.resolve({ ...mockApiData.company, id: companyId })
    : http<ApiCompanyProfile>(`/companies/${encodeURIComponent(companyId)}`),
  updateCompany: (companyId: string, input: { name?: string; description?: string }) => {
    if (!isMockImDevelopment()) return http<ApiCompanyProfile>(`/companies/${encodeURIComponent(companyId)}`, { method: 'PATCH', body: JSON.stringify(input) })
    mockApiData.company = { ...mockApiData.company, ...input, id: companyId }
    return Promise.resolve(mockApiData.company)
  },
  listCompanyMembers: (companyId: string) => isMockImDevelopment()
    ? Promise.resolve(mockApiData.companyMembers)
    : http<ApiCompanyMember[]>(`/companies/${encodeURIComponent(companyId)}/members`),
  updateCompanyMember: (companyId: string, userId: string, role: 'admin' | 'member') => {
    if (!isMockImDevelopment()) return http<{ ok: true; userId: string; role: string }>(`/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ role }) })
    const member = mockApiData.companyMembers.find((row) => row.id === userId)
    if (member && member.role !== 'owner') member.role = role
    return Promise.resolve({ ok: true as const, userId, role })
  },
  removeCompanyMember: (companyId: string, userId: string) => {
    if (!isMockImDevelopment()) return http<{ ok: true }>(`/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
    const index = mockApiData.companyMembers.findIndex((row) => row.id === userId && row.role !== 'owner')
    if (index >= 0) mockApiData.companyMembers.splice(index, 1)
    return Promise.resolve({ ok: true as const })
  },
  listInvitations: (companyId: string) =>
    http<ApiInvitation[]>(`/companies/${encodeURIComponent(companyId)}/invitations`),
  createInvitation: (companyId: string, input: {
    email?: string | null
    role?: 'member' | 'admin'
    note?: string | null
    multiUse?: boolean
    maxUses?: number
    /** Ask the server to send the invitation email on the inviter's
     *  behalf. Ignored unless `email` is also set. Result reported back
     *  via `emailDelivery` on the response. */
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
