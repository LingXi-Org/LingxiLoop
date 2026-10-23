# Explicit course teacher assignment

Written before implementation. This work uses synthetic accounts and local services only; no original account, course, production permission, or private conversation has been inspected. The reported original case is not claimed reproduced.

## Established behavior and missing path

Company teacher identity and course membership are separate. The existing student-to-teacher transaction ends the prior student period and withdraws its old course grants. A company teacher can be assigned explicitly through the existing course membership command; changing organization role must never enroll the teacher into all courses. The browser currently exposes neither that course assignment command nor the company member's existing course list. Company management has no narrowly scoped course command route.

## Failure cases to verify

- A company teacher without membership receives course publishing capability, or a student is added as a teacher by crafted payload.
- The administrator assigns the wrong course or company, or a forged client scope changes the authoritative company.
- A non-administrator reaches the company-management assignment route; an unrelated course teacher, student, or nonmember publishes in the target course.
- Promoting a student accidentally restores old period permissions, old course memberships, private learning records or sessions. Explicit reassignment must use the new active teacher period only.
- A successful assignment is not visible in course members, company member courses, or a fresh teacher request; duplicate submission creates duplicate grants.
- A suspended user, ended identity or archived/read-only course is accepted, or malformed role data bypasses the existing request contract.
- The UI confuses organization administration with teaching rights, requests company-member enumeration as a non-admin, reports success before readback, loses failure/retry state, or applies an obsolete request after a course selection changes.
- A new management endpoint exposes arbitrary learning mutations. Limit it to eligible course listing and the existing explicit teacher-member command, protected by current company administration and existing per-course ACL/transaction checks.

## Evidence ownership

Use the product HTTP routers, real local PostgreSQL and synthetic principals to prove authorization, membership readback, fresh-request persistence and actual forum-assignment publishing. Use the official `@e2e-dev/web` engine to exercise the browser paths and scope/error behavior. Authentication in the API fixture is injected synthetic identity, so browser login/token rotation for the original account remains outside this evidence.
