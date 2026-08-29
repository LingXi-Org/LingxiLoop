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

User + active Memberships + scoped Roles + effective Entitlements + Resource State + Policy
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
- Permission is a computed decision contract, never a database row. The
  context-scoped resolver is the only product-plane authorization path.
- Project lifecycle is selected by `ProjectKind`; Company lifecycle is selected
  by `CompanyType`. All lifecycle values are uppercase SQL/wire values and all
  transitions run through command use cases with conditional updates and audit.
- Permission maps Company and Project lifecycle to `MANAGER_ONLY`,
  `READ_WRITE`, `CLOSE_OUT`, `READ_ONLY`, `TRANSFER_PENDING`, `RETENTION`, or
  `DENY`. Business modules do not interpret lifecycle state independently.

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

## Current lifecycle cutover

Personal Context provisioning is now the only user-creation lifecycle: a new
User receives one `PERSONAL` Company on `PERSONAL_FREE`, an `ACTIVE` OWNER
CompanyMembership, the default Project “我的学习”, and an `ACTIVE` OWNER
ProjectMembership in the same transaction. The database is reset-only, so
there is no historical-user migration, compatibility bridge, or shared
Personal Company.

`PERSONAL_LEARNING`, `TEACHING`, and `INSTITUTIONAL_COURSE` now have distinct
state machines. Personal and Education Companies likewise have distinct
lifecycle contracts; the former generic Company `SUSPENDED` state no longer
exists. Safety suspension remains a User/Policy concern. Generic status PATCH,
Course-level archive mutation, and unarchive-by-boolean are forbidden.

Teacher Free, seats, payments, context-scoped learning state, evidence/event
projections, and organization management UI remain deferred to their ordered
milestones.
