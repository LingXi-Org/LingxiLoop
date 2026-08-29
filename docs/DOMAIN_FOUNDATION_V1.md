# Domain Foundation v1

Domain Foundation v1 makes human identity, tenant ownership, project access,
roles, plans, entitlements, and permission decisions separate concepts. It is
a destructive reset-only schema cutover: there is no migration, dual-write, or
legacy database compatibility path.

## Canonical model

```text
User
 ├─ CompanyMembership ──> Company ──> Plan ──> PlanEntitlement ──> Entitlement
 └─ ProjectMembership ──> Project ──> Company
                              └─ optional Plan override

User + active Memberships + scoped Roles + effective Entitlements + Context
  └─ PermissionDecision
```

- `User` is long-lived identity and account lifecycle state. It never carries
  Teacher, Pro, paid, enterprise, company, project, or plan identity.
- `CompanyMembership` and `ProjectMembership` are independent lifecycle
  records. Only `ACTIVE` memberships authorize access.
- Company roles are `OWNER | ADMIN | MEMBER`. Project roles are
  `OWNER | TEACHER | TA | STUDENT | OBSERVER`.
- Every Company has a Plan. A Project inherits it unless `projects.plan_id`
  selects another Plan. Domain Foundation v1 has no Subscription or billing
  lifecycle.
- Permission is a computed decision contract, never a database row. The first
  resolver is intentionally deferred.

## Existing-callsite impact inventory

The previous authorization source was split between `company_members` and the
one-to-one Course projection `course_members`. The cutover updates these owners:

- HTTP request context and authorization helpers;
- Companies and Identity membership/session repositories;
- Learning courses, invitations, curriculum, missions, rooms, reports, and
  teacher-agent repositories;
- Knowledge and Documents project visibility;
- Conversations, IM routing, WebSocket document access, and channel access;
- Agent OS approvals, control, routines, and learning actions;
- seeds, smoke fixtures, integration reset order, and schema bootstrap checks.

The repository had no Subscription, paid Plan, Pro user, or Entitlement model.
The only global privilege flag was the retired product `users.is_admin`; the
old `/api/admin` and waitlist product control plane is removed independently of
the retained Eval, audit, metrics, health, Agent Run, and Tool Call evidence.

## Deferred work

Personal Company migration for historical users, CompanyType, ProjectKind,
Teacher Free, Education lifecycle, seats, payments, a Permission resolver,
context-scoped learning state, and Workspace UI changes are not part of this
foundation.
