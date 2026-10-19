# Issue 193 independent security review

Review snapshot: 2026-10-19. Product source was reviewed read-only. No commit or deployment was performed by this reviewer. The following are source-verified corrections, not a claim that all release gates passed.

## Findings and corrections

| Severity | Exact location | Failure scenario | Smallest correction and current status |
| --- | --- | --- | --- |
| P1 | `server/src/im/visualize.ts:32-38,152-158` | Membership/permission could be revoked after an unlocked authorization read and before a page mutation, while the later page query did not recheck membership. | Transactional permission dependency locks, membership row locks, and membership predicate on page validation are now present. Backend owns the concurrent revocation test; this reviewer did not repeat it. |
| P1 | `server/src/im/visualize.ts:createVisualizePage/assertVisualizePage` | An older assistant reference could authorize a newer unfinished document, or a page could survive revision/project changes. | Admission now matches delivered complete assistant/run/path; page capabilities bind company/channel/user/project/document version, expiry, and revocation. Page/document/conversation locks cover transactional mutations. Source verified. |
| P2 | `src/features/chat/visualize/web/host.ts:123-137,178-189` | A locally active page could still finish copying a PNG after its server capability/revision became invalid, before the ten-second refresh noticed. | `await validate(page)` now precedes PNG promise resolution; clipboard.write remains synchronous to preserve browser activation. Source verified; browser clipboard regression remains unverified here. |
| P2 | `server/src/im/visualize.ts:closeVisualizePage`; `src/features/chat/visualize/web/host.ts:disposeSandbox` | Closing an expired/replaced page previously failed strict current-version validation and leaked page capacity or poisoned cleanup. | Owned-token deletion is idempotent without requiring current revision; local disposal completes and failed server revocation is queued. Source verified. |
| P2 | `server/src/im/visualize.ts:submitVisualizeFollowUp`; `src/features/chat/visualize/web/host.ts:sendFollowUp` | Lost responses or JSONB key ordering could turn a retry into a duplicate/conflict. | Stable request nonce, structural metadata comparison, durable native acceptance/reconciliation, and no blind retry after an unknown delivery outcome. Source verified. |

No unresolved concrete P1/P2 finding remains in the reviewed latest authorization/stale-page changes. This is not a complete security acceptance: unexecuted checks below remain open.

## Existing browser evidence

The official `tester-army/e2e` CLI and `@e2e-dev/web` engine completed the already-started navigation fixture run: **5 tests passed, exit 0**, duration 101.94 seconds. Reports and screenshots are copied here. The fixture contains only hard-coded dummy values; no actual account, session, page credential, or product data was used.

Cases: baseline, parent-self, parent-none, outer-shell, product-shell. All assert denied access to parent DOM, parent dummy token, document cookie, and localStorage. The baseline explicitly asserts exactly one collector request containing only guest-owned dummy state. Each protected case explicitly asserts zero collector requests for that mode. `navigation-evidence.json` retains a cumulative hits array; filter by the recorded mode when reading it. Product-shell uses the actual `buildWebShell` and CSP declarations read from the product source.

This establishes a concrete Web distinction: an opaque iframe's own CSP does not stop its self-navigation request; an ancestor frame policy can stop it while permitting initial srcdoc. The feature-specific opaque outer shell supplies that policy without changing global security configuration. This is a Chromium fixture result, not an assertion of Electron-equivalent networking controls, a full production host test, or universal browser coverage.

## Reproduction provenance and restrictions

The existing fixture is now archived at `e2e/visualize/security/`; its README provides the repository command. Only hard-coded paths were replaced with `import.meta.url`-relative paths. The archived version has not been rerun. See `COVERAGE.md` for the latest separation between backend coverage and required product UI verification.

Original existing fixture files remain at `/tmp/issue193-security-poc/{e2e.config.ts,server.mjs,navigation.e2e.ts}`. It uses local ports 53193/53194 and reads `/workspace/worktrees/issue193/src/features/chat/visualize/web/document.ts`. Original command was:

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/.lingxi-setup/cache/ms-playwright E2E_TELEMETRY_DISABLED=1 node /workspace/worktrees/issue193/node_modules/e2e/dist/cli/bin.js run --config /tmp/issue193-security-poc/e2e.config.ts
```

No direct Playwright API was imported or run. This command records provenance; it was not rerun after the parent restricted browser verification. The parent reported a platform risk flag, but no actual tool denial or stated denial reason was visible to this reviewer. The previously running operation (session 21064) is now confirmed complete, not pending or uncertain. No blocked operation was retried. Only existing reports were read/archived after the restriction and subsequent explicit archival authorization.

## Remaining unverified gates

- Full production-host negative checks for forged bridge handshakes, synthetic gestures, and replaced/disposed pages were not executed by this reviewer. The navigation fixture does not substitute for those checks.
- Successful clipboard export and stale/revoked export rejection across supported browsers remain with the frontend/E2E owners.
- Backend authorization/revocation concurrency, migration, durable message, and teacher-room runtime execution evidence belongs to the respective owning integration suites; this review confirms source changes only.
- Complete model generation, fixed-fixture visual fidelity, runtime ledger behavior, and standalone render acceptance were not independently executed here.
- Migration 0033 is unchanged; 0046 is additive and retains legacy tables. Both manifests still pin LingxiOS 3.5.3; runtime schema-12 execution assertion is owned by migration tests.

Review checklist: tenant/project/channel/user/page/revision binding; author/run provenance; current membership; state scope and privateContent exclusion; durable follow-up admission; manifest resource allowlist/integrity; opaque nested iframe and private channel; stale cleanup and export revalidation. No release or deployment approval is implied.
