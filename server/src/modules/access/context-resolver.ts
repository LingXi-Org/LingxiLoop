import type { PermissionReason, PermissionRequest, ResolvedAccessContext } from './contracts.js'
import { resolveEntitlements } from './entitlement-resolver.js'
import { PERMISSION_POLICIES } from './policy.js'
import type { AccessRepository, ResourceRecord } from './repository.js'
import { env } from '../../env.js'

export type ContextResolution =
  | { allowed: true; context: ResolvedAccessContext; resource: ResourceRecord | null }
  | { allowed: false; reason: PermissionReason }

export async function resolveAccessContext(
  repository: AccessRepository,
  request: PermissionRequest,
): Promise<ContextResolution> {
  if (!request.actorUserId) return denied('NOT_AUTHENTICATED')
  const actor = await repository.actor(request.actorUserId)
  if (!actor) return denied('NOT_AUTHENTICATED')
  if (actor.deletedAt || actor.suspendedAt) return denied('ACTOR_INACTIVE')
  const platformAdmin = Boolean(actor.emailVerifiedAt)
    && env.PLATFORM_ADMIN_EMAILS.includes(actor.email.trim().toLowerCase())

  const resource = request.resource ? await repository.resource(request.resource) : null
  if (request.resource && !resource) return denied('RESOURCE_NOT_FOUND')
  if (!platformAdmin && resource?.visibilityScope === 'PRIVATE' && resource.ownerUserId !== request.actorUserId) {
    return denied('RESOURCE_NOT_FOUND')
  }

  const resourceProjectId = resource?.projectId ?? null
  if (resourceProjectId && request.projectId && resourceProjectId !== request.projectId) {
    return denied('RESOURCE_SCOPE_MISMATCH')
  }
  const projectId = resourceProjectId ?? request.projectId ?? null
  const project = projectId ? await repository.project(projectId) : null
  if (projectId && !project) return denied('PROJECT_NOT_FOUND')
  if (PERMISSION_POLICIES[request.action].scope === 'project' && !project) return denied('PROJECT_NOT_FOUND')

  const authoritativeCompanyId = resource?.companyId ?? project?.companyId ?? request.companyId ?? null
  if (!authoritativeCompanyId) return denied('COMPANY_NOT_FOUND')
  if (request.companyId && request.companyId !== authoritativeCompanyId) return denied('RESOURCE_SCOPE_MISMATCH')
  if (resource?.companyId && project && resource.companyId !== project.companyId) {
    return denied('RESOURCE_SCOPE_MISMATCH')
  }

  const company = await repository.company(authoritativeCompanyId)
  if (!company) return denied('COMPANY_NOT_FOUND')

  const companyMembership = platformAdmin
    ? { role: 'OWNER' as const, status: 'ACTIVE' as const }
    : await repository.companyMembership(company.id, request.actorUserId)
  if (!companyMembership) return denied('COMPANY_MEMBERSHIP_REQUIRED')
  if (companyMembership.status !== 'ACTIVE') return denied('COMPANY_MEMBERSHIP_INACTIVE')

  const projectMembership = project
    ? platformAdmin
      ? { role: 'OWNER' as const, status: 'ACTIVE' as const }
      : await repository.projectMembership(company.id, project.id, request.actorUserId)
    : null
  if (project && !projectMembership) return denied('PROJECT_MEMBERSHIP_REQUIRED')
  if (projectMembership && projectMembership.status !== 'ACTIVE') return denied('PROJECT_MEMBERSHIP_INACTIVE')

  let companyPlanId = company.planId
  if (company.type === 'EDUCATION' && !platformAdmin) {
    const organizationPlanId = await repository.activeOrganizationSeatPlanId(
      company.id,
      request.actorUserId,
      company.status,
    )
    if (!organizationPlanId) return denied('ORGANIZATION_SEAT_REQUIRED')
    companyPlanId = organizationPlanId
  }

  const entitlements = await resolveEntitlements(repository, project?.planId ?? companyPlanId)
  if (!entitlements.allowed) return denied(entitlements.reason)

  return {
    allowed: true,
    context: {
      actorUserId: request.actorUserId,
      platformAdmin,
      company: { id: company.id, type: company.type, status: company.status },
      companyMembership: { role: companyMembership.role, status: companyMembership.status },
      ...(project ? { project: { id: project.id, kind: project.kind, status: project.status } } : {}),
      ...(projectMembership
        ? { projectMembership: { role: projectMembership.role, status: projectMembership.status } }
        : {}),
      effectivePlan: { id: entitlements.plan.id, code: entitlements.plan.code },
      entitlements: entitlements.entitlements,
    },
    resource,
  }
}

function denied(reason: PermissionReason): ContextResolution {
  return { allowed: false, reason }
}
