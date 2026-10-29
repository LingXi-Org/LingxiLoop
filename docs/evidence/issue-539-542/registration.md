# Registration recovery (#539–#542)

Baseline: `35b64e31` (main, 2026-10-29). Better Auth installed/locked `1.7.2`; Node `22.22.0`; Vitest `3.2.7`. All identities, invitations and injected failures below are synthetic. No production student data was read or changed.

## Contract and coverage

- #539: the server-only, encrypted `user.registrationIntent` is written in the real Better Auth user-create hook, atomically with the identity. The after hook writes the existing claim idempotently and lets credential/OTP creation finish if that write fails. Anonymous duplicate registration returns the same result, never consumes a synthetic response ID, and never replaces the original name, password or invite. The verified owner can recover the original encrypted intent without registering again.
- #540: the existing OTP API remains authoritative. A 30-minute sessionStorage hint contains only email, expiry and invitation-context digest. Refresh restores verification before asynchronous invitation loading; manual continuation works without storage. Cancel, verification success, successful sign-in and sign-out clear the hint. Passwords, OTPs, CAPTCHA, credentials and invitation bearer tokens are not stored there.
- #541: verification success remains successful even when subsequent business provisioning fails. Explicit `/api/registration/recover` requires a trusted verified session, reuses the original claim and normal business invitation admission, observes the existing rate policy and safely converges the link. It never replaces or unsuspends a mapping. Existing completed accounts can explicitly accept another invitation while their original registration claim remains unchanged.
- #542: bounded public codes/messages distinguish invitation rejection, rate limits, unavailable services, incomplete registration and unconfirmed business results. Request IDs are created at the control plane and forwarded as `x-registration-request-id` to the business boundary. Raw provider bodies/HTML/SQL/exception text are not rendered or stored in claim errors. Client gateway failures preserve an existing `x-request-id` or `cf-ray`, and leave correlation absent when neither exists.

## Executed checks

The corrected owning duplicate-registration regression was also run against an isolated checkout of baseline `35b64e31`; it failed with HTTP 500 on duplicate signup. The same case passes on this patch, including unchanged credential hash/name/claim after duplicate requests.

- `npm run control:test`: 27 passed (4 files), including 12 owning registration cases using actual Better Auth and D1 migrations/runtime. SMTP delivery alone is recorded by a test mock; CAPTCHA and business transport use explicit synthetic fixtures. Cases cover identity database write failure, duplicate verified/unverified identities, immutable credentials/invite, concurrent signup/recovery, failed claim insert, business 503, network result unknown, invalid receipt, corrupt encrypted token, failed D1 link write, successful explicit recovery, permissions and rate limit. The local Workers runtime reports its supported compatibility date is 2025-12-17, falling back from the requested 2026-09-01.
- Real PostgreSQL + Redis: `npm run test:integration -- --file identity-vertical-slice.test.ts`: 6 passed, 0 skipped. Verified gateway subject/signature/replay rejection, normal/project admission, same named invite readback after expiry/revocation, another identity rejection, concurrent retries with one user/membership/invite use, and propagated correlation. Existing database constraints require named teacher invitations; no speculative shared teacher-invite schema was added.
- `node --import tsx --experimental-test-module-mocks --test --test-force-exit src/auth/registration.test.ts src/auth/api.test.ts src/api/core/http.test.ts`: 4 passed. Covers JSON/text/HTML/empty errors, safe/absent correlation, OTP/limit message mapping, hint expiry/context isolation/storage denial, and authorized invitation-login fallback.
- `npm run typecheck`, `npm run control:typecheck`, `npm run server:typecheck`: passed.
- `npm run lint`: passed with existing unrelated warnings (47 warnings, 2 infos); `npm run control:lint`: passed.
- `npm run build`: passed.
- Product database migration command and its second no-op ran against the existing dedicated local test database. No PostgreSQL schema change is part of this patch. The new D1 migration is applied by the owning Worker tests; no remote migration was run.

The first test attempt used a real SMTP socket and timed out; it was replaced by an explicit recording mock. An intermediate local-only fixture assumed shared teacher invites and was rejected by the real `teacher_invitation_named` constraint; the fixture and speculative schema were removed. Transient Vitest unhandled rejection artifacts from synchronous `fetchMock.replyWithError` were eliminated by explicit transport-failure mocks; final test runs report no unhandled errors.

## Operations and remaining acceptance

Apply D1 migration `0006_registration_intent.sql` through the existing release entry before the new Worker. It adds one nullable, private column and preserves existing user/claim/link constraints. Old identities without a stored intent need a verified explicit invitation accept; that invitation is validated before a claim is recorded. No anonymous email lookup or password replacement is introduced.

Independent read-only review found that AuthGate could display the generic HTTP client's raw provider message. The corrected candidate maps session and invitation-login fallback errors through the same bounded public registration mapper; the raw-HTML regression covers that mapping. No other concrete review finding was reported.

In existing controlled Worker/business logs, search the exact returned request ID for JSON events `registration.failure` and `registration.business`. Claim errors retain only `{requestId, stage, code, status, outcome}`; `outcome: unknown` means the remote result requires reconciliation, not that no business write occurred. If even the diagnostic D1 update fails, the controlled event still identifies the failed request; the next explicit attempt is recoverable from the original claim/intent.

Real browser/mobile lifecycle acceptance, production delivery, real SMTP delivery and production deployment were **not run**. Page behavior has source/storage/API coverage and remains browser-unverified. No PR merge, approval or issue close is part of this delegated implementation.
