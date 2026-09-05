export type EnterpriseCapability =
  | 'SCIM_PROVISIONING'
  | 'SIEM_SINK'
  | 'ADVANCED_SSO'
  | 'PRIVATE_DEPLOYMENT'

export interface EnterpriseCapabilityAvailability<Capability extends EnterpriseCapability> {
  capability: Capability
  status: 'AVAILABLE' | 'NOT_SUPPORTED'
  reason: string
}

/** Future SCIM providers report availability here before any provisioning operation is exposed. */
export interface ScimProvisioningPort {
  availability(): Promise<EnterpriseCapabilityAvailability<'SCIM_PROVISIONING'>>
}

/** Future SIEM providers report availability here before an event sink can be configured. */
export interface SiemSinkPort {
  availability(): Promise<EnterpriseCapabilityAvailability<'SIEM_SINK'>>
}

/** Future advanced SSO providers report availability without bypassing Better Auth. */
export interface AdvancedSsoPort {
  availability(): Promise<EnterpriseCapabilityAvailability<'ADVANCED_SSO'>>
}

/** Future private deployment providers report availability without simulating a deployment. */
export interface PrivateDeploymentPort {
  availability(): Promise<EnterpriseCapabilityAvailability<'PRIVATE_DEPLOYMENT'>>
}
