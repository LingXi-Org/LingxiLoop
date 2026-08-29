export type PermissionAction =
  | 'project:read'
  | 'project:update'
  | 'project:invite'
  | 'student:view_learning_state'

export interface PermissionContext {
  userId: string
  companyId: string
  projectId?: string
}

export interface PermissionDecision {
  allowed: boolean
  reason?: string
}

/**
 * The sole product-permission contract. Domain Foundation v1 deliberately
 * provides no implementation; the context-aware resolver is a later change.
 */
export interface PermissionService {
  can(action: PermissionAction, context: PermissionContext): Promise<PermissionDecision>
}

