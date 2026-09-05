# Product variable ownership

Unsettled product choices are not runtime defaults. Each choice must have one
authoritative owner and missing or invalid configuration must deny the gated
operation.

| Variable kind | Owner | Missing configuration |
| --- | --- | --- |
| Commercial limits and access | `PlanEntitlement` | capability denied |
| Tenant governance and lifecycle | versioned `Policy` | transition denied |
| Reversible rollout | typed `FeatureFlag` | feature disabled |
| Evaluation criteria | `VersionedRubric` | evaluation not runnable |
| Education contract terms | `ContractConfig` | contract-gated operation denied |

Provider selection is not a feature flag. Payment, LMS, Push, advanced
SSO/SCIM, SIEM and private deployment remain explicitly unavailable until a
separate provider-activation milestone supplies a real adapter and its owning
configuration. No placeholder adapter may report success.
