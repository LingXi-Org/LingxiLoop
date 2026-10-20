# Product checkpoint — not a release candidate

Base PR221 `121de820107c00a81e77f9583322ede8ca7d33ac`; failure model/tests committed separately in `06c0a1be`. No production requests, migrations, dependency lock changes, merge or deployment.

The product now consumes the proposed public runtime contract (`PublicTextPart`, `consumePublicTextAttempts`, trusted `allowPublicText`) and preserves recorded attempt identities. Public commentary remains distinct from the verified answer; candidate previews are disabled. IM source-message/run anchors recover historical runs using current authorization and bounded product-binding cursor pages. The attention-only history resets an offset when its underlying run revision changes.

Completed against the original formal 3.5.6 baseline before implementation:

- Real local PostgreSQL + product HTTP history red: old cancelled run excluded from recent 20; anchor query unavailable. Candidate history green: 1 failed and 23 cancelled runs across two pages, cross-scope/internal/cursor rejection.
- Real public Worker/control/SQL/Assistant Transport red: a user-text callback did not persist `public.text.delta` before the tool. This is the owning failure, not just a missing-type check.
- Three targeted projection/history failures reproduced; initial product projection/history checks passed 8/8 before the new public runtime helper was wired. The same-fence provider attempt case separately exposed and corrected old running progress revival.
- Official `@e2e-dev/web` browser red: changing attention state retained offset 40 and skipped its first page. A second red exposed hidden terminal commentary; both browser cases now pass, retaining the latest explanation and final answer. Separate reds cover terminal IM anchors and commentary falling outside the compact snapshot's 40 recent activities.

Current local package is **preliminary/unpublished**, still labelled 3.5.6 by upstream: `/tmp/issue215-preliminary-pack/lyyzka-lingxios-3.5.6.tgz`, SHA256 `82272b9a0cdaff194df21a5baab4f99cad72819958d9daceb8b3f695986e08e0`. It is installed only in this independent worktree's private `node_modules`; formal manifests/locks remain unchanged. Never deploy this checkout until the sole integrator pins the eventual formal release and reruns affected checks against the final head.

Candidate checks passed: real Worker/SSE/state-first reload complete/cancelled/revoked 3/3; real HTTP anchored history 1/1; existing public activity integration 1/1; affected unit tests 39/39; supplemental projection 4/4; official browser 2/2; server/web typechecks and focused lint. [Machine-readable qualification](preliminary-validation.json), [raw logs](preliminary-logs) and [browser screenshots](preliminary-browser) identify this preliminary package. Unit counts overlap and must not be summed into an independent total. Browser fixtures use the actual component tree with synthetic history; they do not claim a real-provider browser run.

**Release blocked:** independent review found that arbitrary `user-text` could be persisted before the final answer's content guard. A trusted incremental safety gate must withhold uncertain suffixes and reject internal protocol/reasoning content before publication. This preliminary pack does not implement that gate. Final citation/completeness validation must remain separate from partial-text safety. Existing authorization tests do not cover this content boundary.

Pending: the gate and its split-chunk owning red/green tests, final upstream review/formal release, exact final-package checks, independent final product review, final CI, immutable-image rollout and production acceptance. Fixture teardown logs include outbox acknowledgement warnings with retained durable intent; these tests do not claim outbox drain. Real provider, production operations and long soak are not claimed.
