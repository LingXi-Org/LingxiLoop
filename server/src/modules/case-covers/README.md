# Hairline case cover generation

This worker-only module consumes an already authorized, saved case snapshot. It
uses the shared `createChatCompletion` ledger, chooses a new article-related
object, and repairs one invalid proposal at most. Read routes never call it.
Storage/lease/ACL/version fencing belongs to `../cases/cover-*`.

## Fixed upstream and provenance

Upstream: https://github.com/lucasmarkes/hairline/tree/37d2e78dcb333ab30c3338e28ed4a690364ea014

`vendor/manifest.json` records SHA256 for the original MIT license, create Skill,
concepts, rules, unchanged kernel, unchanged bench, builder, validator, look
checklist and both appropriate examples. No installer, latest download or
upstream look/browser installer runs per task. The complete skill/rules/examples
and kernel API index enter each generation request. `cover-upstream.ts` verifies
all resource hashes before reading or invoking the originals.

`assembleAndValidate` runs the exact upstream builder and validator in a bounded
Node subprocess with cleared credentials. The validator uses `node --check` on
its own temporary file; it does **not** execute generated JavaScript. It is a
style/syntax/template gate, not the execution sandbox. Its original HTML and
hash are retained in result metadata. Validation never claims that the separate
graph-only presentation passes original bench equality.

## Browser and presentation boundaries

`cover-renderer.ts` is a real production browser path: Debian Chromium under
existing bubblewrap, all namespaces unshared, UID/GID 1000, no inherited
environment, no network namespace sharing, no application tree/session/home
mounts. Only read-only installed system runtime and this job's input directory
are mounted. Browser profile and temporary data are ephemeral. Chromium's own
sandbox stays enabled. The launcher applies CPU/process/file/descriptor limits,
the parent kills the process group after 15 seconds and caps output at 1 MB.
The existing Worker cgroup must have <=1 GiB memory and <=128 tasks. Otherwise
preflight fails **before** the model call. No unsafe browser fallback exists.

The production Dockerfile pins official Debian bookworm-security Chromium and
chromium-common `156.0.8078.47-1~deb12u1`. Published amd64 download sizes at source
inspection: 81,151,788 and 31,625,004 bytes; installed sizes: 290,220 and 66,496 KiB,
before transitive libraries. This is a substantial image addition. A package
removed from the repository makes the build fail rather than updating silently.
No package installation or image build was performed in this workspace.

Only the browser-executed `#stage > svg` is extracted. `cover-validation.ts`
parses and whitelists that SVG; it rejects active elements, event attributes,
external links, unknown markup, entities, invalid geometry and excessive size.
It retains local gradient/mask references used by the pinned engine, and writes
its fixed light palette into attributes. The preview has a white background so
it remains readable in either app theme. It is never a fabricated first frame.

`cover-presentation.ts` emits graph-only HTML, with pinned kernel and generated
figure in hash-allowed script slots. It controls theme, reduced motion, explicit
engagement and teardown. It must be loaded through the trusted nested opaque
iframe adapter owned by `CaseCover`; it must never be served directly as an
active document or injected into the app. The outer adapter must prevent child
self-navigation and validate message sources. CSP alone on this inner document
is not claimed to block self-navigation. Native nested-frame policy needs its
own real-browser verification.

## Evidence and remaining acceptance

- Baseline: `2686f475eac075bc9033f13714d5d6bbfa5078eb`.
- Synthetic tests were written first and initially failed missing implementation.
  Focused tests cover parser rejection, upstream mask support, bounded repair,
  no billing on unavailable isolation, policy hashing and namespace arguments.
- One explicitly authorized upstream qualification ran **once** on
  2026-10-24, between 05:20:32Z and 05:20:51Z, elapsed 4.275s, exit 0:
  `/workspace/.tools/node-v22.23.3-linux-x64/bin/node /tmp/loop-376-render/server/src/modules/case-covers/verify-upstream.mjs`.
  Script SHA256 `dc47af3ad660dd0c117df7bf6a0f829ce5a5be075d91a8dddd256494d707e655`;
  runner SHA256 `0c9eb11658fe0dfaf7a0c277689f56c3fb115fe672024c45904348e552decf8a`.
  Both complete original examples passed:
  - riffle HTML SHA256 `93de173eed89e36bc5681c3917915eb4d582b04fcf07d7c1ecb18a040ddcef25`
  - terrain HTML SHA256 `423bf7b1af6d745ec18bc9e34d3456d9dfa160f9ef62a27d6bf8da9099a81173`
  Neither generated JavaScript nor a browser executed in that qualification.
- A harmless local `/usr/bin/bwrap --unshare-all ... -- /usr/bin/true`
  probe failed with `bwrap: setting up uid map: Read-only file system` (exit 1).
  The target program did not execute. No namespace/seccomp/capability changes
  or unsafe fallback were attempted. This environment cannot validate the
  production rendering path; use an already approved environment with working
  unprivileged user namespaces and the required cgroup limits.
- Still unverified: production image package resolution/build, actual Chromium
  sandbox execution and first-frame capture, resource ceiling fit, 3 real saved
  article/model results, visual/interaction acceptance through official
  tester-army/e2e, and combined database/version/ACL worker behavior.

Reproduce pure tests (no upstream script imports/execution):

```
node --import tsx --test server/src/modules/case-covers/cover-validation.test.ts server/src/__tests__/presentation-no-browser.test.ts
```

Do not rerun `verify-upstream.mjs` under the consumed one-action authorization.
