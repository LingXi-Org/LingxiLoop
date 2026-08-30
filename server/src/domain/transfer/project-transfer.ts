export const PROJECT_TRANSFER_STATUSES = [
  'PENDING',
  'READY',
  'REJECTED',
  'CANCELLED',
  'COMPLETED',
] as const

export type ProjectTransferStatus = typeof PROJECT_TRANSFER_STATUSES[number]
export type ProjectTransferCommand = 'MARK_READY' | 'REJECT' | 'CANCEL' | 'COMPLETE'

export type ProjectTransferTransition =
  | { outcome: 'APPLIED'; from: ProjectTransferStatus; to: ProjectTransferStatus }
  | { outcome: 'ALREADY_APPLIED'; from: ProjectTransferStatus; to: ProjectTransferStatus }
  | { outcome: 'INVALID'; from: ProjectTransferStatus; to: null }

export function transitionProjectTransfer(
  status: ProjectTransferStatus,
  command: ProjectTransferCommand,
): ProjectTransferTransition {
  const target = targetStatus(status, command)
  if (!target) return { outcome: 'INVALID', from: status, to: null }
  return { outcome: target === status ? 'ALREADY_APPLIED' : 'APPLIED', from: status, to: target }
}

function targetStatus(
  status: ProjectTransferStatus,
  command: ProjectTransferCommand,
): ProjectTransferStatus | null {
  switch (command) {
    case 'MARK_READY':
      return status === 'PENDING' ? 'READY' : status === 'READY' ? status : null
    case 'REJECT':
      return status === 'PENDING' || status === 'READY'
        ? 'REJECTED'
        : status === 'REJECTED' ? status : null
    case 'CANCEL':
      return status === 'PENDING' || status === 'READY'
        ? 'CANCELLED'
        : status === 'CANCELLED' ? status : null
    case 'COMPLETE':
      return status === 'READY' ? 'COMPLETED' : status === 'COMPLETED' ? status : null
  }
}

export function projectTransferConditionsReady(input: {
  teacherOwnerConfirmed: boolean
  educationAdminConfirmed: boolean
  targetMembershipActive: boolean
  targetSeatActive: boolean
  policyEnabled: boolean
  legalBasisConfigured: boolean
}): boolean {
  return Object.values(input).every(Boolean)
}
