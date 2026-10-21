# PR265 restore lifecycle follow-up

Base: `aac9d745140cd0243e530351039b557537d60da3`. The independent review found that closing settings, reopening before an accepted restore, and then receiving its result leaves the new settings list stale. It also identified completion during the closing animation before effect cleanup. The failure model preceded the implementation and is preserved in the new owning test and independent review artifacts.

The existing conversation store now emits a numeric removed-list revision only after an accepted restore in the still-current authorized scope. The mounted settings list observes that revision and refetches, even when another, now-closed view initiated the restore. No conversation content is retained in a new global cache. Existing server authorization, membership, personal removal and restore request semantics are unchanged.

A data-account view epoch advances when that panel enters or leaves visibility, including settings close; switching between other settings sections does not advance it. Closed content is removed immediately, and a captured epoch rejects old completions even during animation or rapid reopen. Read-request cancellation is separate from mutation/view lifetime, so a revision-triggered refetch cannot strand the restore's pending state. The existing browser fixture's store boundary was updated to expose the same selector/revision contract; no browser run is claimed for this follow-up.

## Bounded validation

- Same final owning suite against exact base sources: **1 passed / 6 failed**. Two key reds show the stale reopened row and immediate-close notification; additional assertions establish invalidation, pending and generation behavior.
- Candidate: **7/7 passed**. Covers close before animation cleanup, reopen before acceptance, accepted restore refetch while normal-list reload remains pending, old-scope acceptance, error retry, rapid close/reopen and unrelated settings transitions.
- Targeted Biome lint: **6 files, no errors**.
- Targeted TypeScript roots plus unchanged exact-head imports read through an in-memory Git filesystem: **0 diagnostics**. No full checkout, install or emitted output; 65 sparse files read from Git. This is not a full application build.
- `git diff --check`: passed. Node **v24.19.0**, reused existing dependency directory read-only.

The tests compile actual store/component sources and use real Zustand vanilla state, with explicit synthetic React render/effect/cleanup and API boundaries. They are deterministic lifecycle regressions, not browser, live backend, authenticated account or production validation. There were no production/provider/DB calls. Full web CI and independent final review remain with the root integrator. No merge, push or deployment was performed by this author.

## Reproduce

```sh
node --import tsx --test src/features/settings/removedConversationsLifecycle.test.ts
```

To reproduce the red suite without modifying a working tree, the private in-memory read overlay replaces only the three owning source reads with exact base Git objects:

```sh
node --require ./docs/evidence/issue-263-restore-races/baseline-overlay.cjs --import tsx --test src/features/settings/removedConversationsLifecycle.test.ts
```

The second command intentionally exits 1. The baseline commit must exist locally. `baseline-red.tap.gz` preserves the original Node failure transcript byte-for-byte; the readable .txt copy removes only trailing whitespace. `receipt.json` binds tested source and evidence hashes. No package or lockfile changed.
