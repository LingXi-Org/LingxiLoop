# S153P validation receipt

Latest implementation tested: `38ae426276748d2e26ea55fa7204d768d988ab70`, based on `2db5bbcddc8f14ac62500e36594dc49793c9e096`. Subsequent evidence commit changes only this evidence/documentation. No old executor files were recovered or used.

Final foundation run: Node 22.23.3, Biome 2.5.8, real repository E2E PG16/Redis7, synthetic local control endpoint, optional Notebook scripted unavailable. Cloud cgroup: 4 CPU quota (`400000/100000`), 16 GiB memory. Host CPU/memory details and source SHA256 hashes are in each sampler receipt; these are not production container specifications.

Passed: 7 HTTP/PG/Redis regression checks, natural cleanup/exit, strict foundation import-graph typecheck, server lint and script lint, both Compose parses/probe deadlines/resource invariants, script syntax, `git diff --check`, and actual `nginx -t` in a network-disabled disposable container. Nginx digest: `sha256:892bb2152464f0c5d8972593a5f5afaf8054552580b699d95f8ff4af08c2d33d`.

Final short fixture sampling uses 3 seconds per phase, with zero request failures. Latest exact request counts, P50/P75/P95/P99 and time-series data are in `evidence/foundation-*.json`. These very short results validate sampler and plumbing, not production latency/resource sizing or optimization gains. The fixture is not the production runtime or a real conversation.

**Local frozen full-product validation is blocked.** Preinstalled LingxiOS was 3.3.8. Exact root `npm ci` with 3.4.7 failed with GitHub Packages 401, and an existing-authorized GitHub download also returned 401. Offline retry found no cached exact 3.4.7. No credentials/security settings/manifests/locks were changed. No source-built or old-version replacement was used.

For limited independent diagnostics, public dependencies were installed in `/tmp` from a temporary copy of the root lock with only unavailable LingxiOS removed; the workspace `node_modules` links to that directory. Thus **all foundation results are explicitly not frozen full-product acceptance**. The default regression runner rejects the missing frozen dependency. Re-run `npm ci` with working package access before any acceptance or merge.

Full commands were attempted under the initial Node 24.19.0 toolchain: `server:typecheck` exit 2 (missing LingxiOS exports and downstream type errors); `server:test` exit 1, **70 passed / 8 failed / 0 skipped**, with each failure involving missing LingxiOS imports. Raw logs are retained. No passing subset overrides those failures. Final foundation checks were subsequently repeated under the provided Node 22.23.3; full frozen gates remain unverified.

Unverified / Astra handoff: exact production-image baseline and paired full dialogue comparison, retained-heap/allocation profiles, upstream/runtime maintenance ownership/backoff and queue metrics, real provider/WuKong delivery, 24h soak, official tester-army/e2e browser fault/recovery recordings and durable-write idempotency, Komodo CLI/API/update-state recovery, and rollout/rollback acceptance. No production state/configuration/security/credential change, deployment, merge or issue closure was performed.

Reproduction and proposed canary/rollback gates: `README.md`. Machine-readable status and exact boundaries: `evidence/validation.json`.


## CI follow-up and compatibility fix

The first CI run on `ef2e1ce31ab5ce8c9a1e0635e71b2a93cf79c607` successfully installed the root lock and passed server lint/typecheck/tests/selectors and deployment-contract jobs. Integration was still running when the correction was prepared. Thus the local 3.4.7 download 401 does **not** explain CI code-test outcomes. Original job log download returned `Forbidden`; no alternate route or credential/permission change was attempted. Job/step conclusions remain readable through GitHub metadata; exact remote test counts are not claimed.

Reviewing the existing `dependency-readiness.test.ts` exposed a real code regression: adding control to the legacy diagnostic response changed its exact three-field contract and could turn a healthy diagnostic into 503. An exact-body HTTP assertion reproduced the extra `control` field before the fix (`evidence/diagnostic-contract-red.log`). The latest implementation restores the original PG/Redis/Notebook diagnostic shape and 2s/2s/30s budgets. Control remains required on the new readiness endpoint. Expanded HTTP assertions cover both Notebook states and control failure independence. No shared runtime or existing integration test was changed.

After this correction, Node 22 foundation regression 7/7, existing metrics tests 8/8, deployment contract tests 18/18, selector tests 2/2, strict foundation typecheck, server/script lint and Compose validation passed. These local diagnostic checks still use the explicitly limited public dependency tree; they are not a frozen new-product run. CI rerun after pushing the fix is tracked separately. All soak/provider/WuKong/browser/Komodo limits above remain.
