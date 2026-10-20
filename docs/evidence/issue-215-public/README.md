# Product checkpoint — not a release candidate

Base PR221 `121de820107c00a81e77f9583322ede8ca7d33ac`; failure model/tests committed separately in `06c0a1be`. No production requests, migrations, dependency lock changes, merge or deployment.

The product now consumes the proposed public runtime contract (`PublicTextPart`, `consumePublicTextAttempts`, trusted `allowPublicText`) and preserves recorded attempt identities. Public commentary remains distinct from the verified answer; candidate previews are disabled. IM source-message/run anchors recover historical runs using current authorization and bounded product-binding cursor pages. The attention-only history resets an offset when its underlying run revision changes.

Completed against the original formal 3.5.6 baseline before implementation:

- Real local PostgreSQL + product HTTP history red: old cancelled run excluded from recent 20; anchor query unavailable. Initial candidate history green: 24 cancelled runs across two pages, cross-scope/internal/cursor rejection.
- Real public Worker/control/SQL/Assistant Transport red: a user-text callback did not persist `public.text.delta` before the tool. This is the owning failure, not just a missing-type check.
- Three targeted projection/history failures reproduced; initial product projection/history checks passed 8/8 before the new public runtime helper was wired. The same-fence provider attempt case separately exposed and corrected old running progress revival.
- Official `@e2e-dev/web` browser red: changing attention state retained offset 40 and skipped its first page. Browser green is pending final recording at this checkpoint.

Current local package is **preliminary/unpublished**, still labelled 3.5.6 by upstream: `/tmp/issue215-preliminary-pack/lyyzka-lingxios-3.5.6.tgz`, SHA256 `82272b9a0cdaff194df21a5baab4f99cad72819958d9daceb8b3f695986e08e0`. It is installed only in this independent worktree's private `node_modules`; formal manifests/locks remain unchanged. Never deploy this checkout until the sole integrator pins the eventual formal release and reruns affected checks against the final head.

Pending: candidate owning Worker/SSE/reload green, exact final-package type/lint/tests, broader publication cancellation/retry/current-authorization boundaries (upstream and product owning), independent final review, final CI, immutable-image rollout and production acceptance. Real provider and long soak are not claimed. Private intermediate logs live at `/tmp/issue215-*.log`; verified public evidence will be retained after the final candidate is qualified.
