# Domain model

LingxiLoop separates human identity, tenant ownership, project access, plans, entitlements, and authorization decisions.

```text
User
 ├─ CompanyMembership ──> Company ──> Plan / Subscription / Entitlements
 └─ ProjectMembership ──> Project ──> Company

User + active memberships + scoped roles + effective entitlements + resource state + policy
  └─ PermissionDecision
```

- `User` owns identity and account lifecycle, not tenant, role, project, or paid-plan identity.
- Company and Project memberships are independent, scoped lifecycle records.
- A Project belongs to one Company and has one canonical kind and lifecycle. State transitions run through application commands with conditional writes and audit evidence.
- Permission is computed from the acting user, active memberships, scoped roles, entitlements, resource state, and policy. It is not persisted as an authoritative permission row.
- Personal, teaching, and institutional contexts keep their distinct lifecycle and entitlement rules.
- Evidence, domain events, approvals, attention items, learning state, and transfer records preserve tenant provenance and append-only history where defined by the schema.
- WuKongIM remains authoritative for durable messages; PostgreSQL holds product projections and workflow ledgers rather than a second chat store.

The current database contract is the ordered migration chain under `server/src/db/migrations/`. Changes extend that chain forward; this document does not define a reset milestone or a second schema authority.
