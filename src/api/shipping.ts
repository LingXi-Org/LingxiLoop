
import { http } from '@/api/core/http'
import type { ShippingFeatureStatus, ShippingFeatureDetail, ShippingOverview, } from './contracts'

export const shippingApi = {
  getShippingOverview: () => http<ShippingOverview>('/shipping/overview'),
  getShippingFeature: (id: string) => http<ShippingFeatureDetail>(`/shipping/features/${encodeURIComponent(id)}`),
  createShippingFeature: (input: {
    title: string; problem?: string; desiredOutcome?: string; contractSummary?: string;
    priority?: string; riskLevel?: string; releaseTarget?: string | null; builderIds?: string[];
    projectId?: string | null; conversationId?: string | null; documentId?: string | null; boardCardId?: string | null;
  }) => http<ShippingFeatureDetail>('/shipping/features', { method: 'POST', body: JSON.stringify(input) }),
  updateShippingFeature: (id: string, input: Partial<{
    title: string; problem: string; desiredOutcome: string; contractSummary: string;
    priority: string; riskLevel: string; releaseTarget: string | null; builderIds: string[];
    projectId: string | null; conversationId: string | null; documentId: string | null; boardCardId: string | null;
  }>) => http<ShippingFeatureDetail>(`/shipping/features/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  transitionShippingFeature: (id: string, status: ShippingFeatureStatus) =>
    http<ShippingFeatureDetail>(`/shipping/features/${encodeURIComponent(id)}/transition`, { method: 'POST', body: JSON.stringify({ status }) }),
  createShippingInvariant: (featureId: string, input: { title: string; description?: string; kind?: string; required?: boolean }) =>
    http<ShippingFeatureDetail>(`/shipping/features/${encodeURIComponent(featureId)}/invariants`, { method: 'POST', body: JSON.stringify(input) }),
  createShippingVerification: (featureId: string, input: {
    title: string; description?: string; method?: string; required?: boolean; invariantId?: string | null;
    ownerId?: string | null; builderIds?: string[]; dueAt?: string | null;
  }) => http<ShippingFeatureDetail>(`/shipping/features/${encodeURIComponent(featureId)}/verifications`, { method: 'POST', body: JSON.stringify(input) }),
  updateShippingVerification: (featureId: string, verificationId: string, input: Record<string, unknown>) =>
    http<ShippingFeatureDetail>(`/shipping/features/${encodeURIComponent(featureId)}/verifications/${encodeURIComponent(verificationId)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  createShippingRelease: (featureId: string, input: {
    environment: string; version?: string; commitSha?: string; releaseNotes?: string; rollbackPlan?: string;
    knownGaps?: Array<Record<string, unknown>>; baseline?: Array<Record<string, unknown>>; readbackDueAt?: string | null;
  }) => http<ShippingFeatureDetail>(`/shipping/features/${encodeURIComponent(featureId)}/releases`, { method: 'POST', body: JSON.stringify(input) }),
  shippingReleaseAction: (featureId: string, releaseId: string, input: { action: string; evidence?: Array<Record<string, unknown>>; reason?: string }) =>
    http<ShippingFeatureDetail>(`/shipping/features/${encodeURIComponent(featureId)}/releases/${encodeURIComponent(releaseId)}/action`, { method: 'POST', body: JSON.stringify(input) }),
  createShippingFriction: (input: Record<string, unknown>) =>
    http<{ id: string }>('/shipping/friction', { method: 'POST', body: JSON.stringify(input) }),
  updateShippingFriction: (id: string, input: Record<string, unknown>) =>
    http<{ ok: boolean }>(`/shipping/friction/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  createShippingRegression: (featureId: string, input: Record<string, unknown>) =>
    http<ShippingFeatureDetail>(`/shipping/features/${encodeURIComponent(featureId)}/regressions`, { method: 'POST', body: JSON.stringify(input) }),
  updateShippingRegression: (featureId: string, regressionId: string, input: Record<string, unknown>) =>
    http<ShippingFeatureDetail>(`/shipping/features/${encodeURIComponent(featureId)}/regressions/${encodeURIComponent(regressionId)}`, { method: 'PATCH', body: JSON.stringify(input) })
}
