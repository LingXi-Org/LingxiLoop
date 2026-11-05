# Compatible delivery split for PR696

Source: production main1bd9e539bea64d9bfd356d68c7dcf3e7e4fdbaff, formally installed LingxiOS3.8.25. The integrated pre-split candidate is b6782230bf6d1ca81972412e34eee55ff3fb5aff.

The pre-split skill body changed the SDK harness identity. The existing same-SDK rolling release path does not implement the held-admission, source drain and global zero-nonterminal cutover required for that identity change. This follow-up removes the guidance delta instead of adding or bypassing a release mechanism.

## Removed from this release

`server/src/modules/artifacts/skills.ts` is restored byte-for-byte to main1bd9e539. The added `slides.design_systems` description sentence is restored too. Deferred changes are: explicit create-before-design-system guidance, stricter prose about ifMatch on all existing Slides files, and the explanatory430→400 host-projection sentence. Existing incremental saving guidance from the already-integrated formal25 release remains.

Those guidance changes remain available in the pre-split commit history. They may return only through a supported release that holds admission across source drain, retains queued/leased/waiting work on the matching source, establishes deployment-wide zero nonterminal work before target admission and preserves compatible recovery. No guidance changes are hidden behind a reused version/hash.

## Kept and compatibility boundary

New Slides defaults/tokens project430 to supported400; old saved resources and Design resources remain intact. Both values use the existing v4 file/schema; the old editor/checker already accepts400. A previously successful create/write still replays its existing ledger receipt and saved bytes. No existing artifact is rewritten.

CAS/install rejection now uses the already-supported formal25 `version_conflict` classification. The transaction still has no effect, and the same parser, authorization, CAS, idempotency, receipt success shape and verifier contracts apply. No action is replayed merely to change an old diagnostic. Stored prior failure receipts are preserved.

All public product tool contract hashes, skill indexes and presentation indexes equal the source snapshot. No SDK changes, migration/provenance edits, admitted-pin rewrites, cancellations/deletions of production work or compatibility executor are introduced. The release controller and all its existing gates are unchanged.

## Two fingerprint layers

Captured from the exact source worktree and exact formal25 public exports, not copied into a runtime override:

- assembled product harness: `2cd6afd4037eb4596c6ef9b3ee1fdc6d00540d5fa3e05ee0820ba79f5e92e2cb`;
- actual native admission pin after SDK helper/memory tool registration: `8c8b2433d1df76cf30f8410ce83278588ba2a19c2c99360dc341a37ab20369d1`.

Before the split, the assembled candidate was `ed91050db5636b67511c9622dd75b87d50b92a28779772603468a823f551417d` and the regression failed. After the split, every source index and contract matches. The final admission hash is captured by admitting one fixture request through main's actual product control plane in a fresh isolated PostgreSQL database, reading its persisted pin, and closing the fixture. No Worker/model was started. `harness-main-1bd9e539.json` stores hashes and public identity metadata only, never model messages or skill bodies.

The native regression must additionally prove that a request admitted with that source pin can be claimed and loaded by the candidate without rewriting its pin. A synthetic changed catalog must still be rejected by the SDK before its product context provider is called, and the compatible context must remain loadable afterward. This is not a source/target cutover simulation or an exception to the changed-harness gate.

## Evidence limits

The four historical real-provider samples were taken before this guidance split and all remain partial. They are retained as diagnostic records, not new-candidate end-to-end or performance acceptance. No new provider calls follow the recorded429. The new tests use exact formal25 and dedicated local services; production source identity and all ordinary deployment checks remain the integrator's responsibility. No production release is started here.

## Recorded checks

Exact formal25 source capture and candidate comparison passed. The source-index regression first failed for b6782230's assembled fingerprint and then passed after guidance removal. Current server unit suite209/209, Slides/real-PostgreSQL flow7/7 (including retained source pin and mismatch rejection), Design truthful-failure flow1/1, `server:typecheck` and `server:lint` passed. The opt-in provider test skipped with exit0. No real model request or production release was executed.
