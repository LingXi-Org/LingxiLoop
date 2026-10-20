# Same-schema host release independent review

Reviewed commit: `731482a1fd98ed781bb1346273ee63fe92fef9f7`  
Base: `16313a843aa824050e7cfb88f66db80193a88492`  
Worktree: `/workspace/LingxiLoop-same-schema-host-release`  
Reviewer: `/root/host_preparation_review`  
Scope: local-only independent implementation review. No production API requests or deployments were made by this review.

## Decision

PASS for the implementation at the exact reviewed commit. No unresolved P1/P2 finding remains in the reviewed diff. This approves delivery of this driver for a separately qualified concrete release; it is not acceptance of a future production target, nor permission to bypass its plan, image or CI gates. Worktree was clean and `git diff --check` passed. Both new commits preserve leecyang as author and committer; the classification fix was appended without rewriting d1341cba history.

## Independent validation

At the exact frozen HEAD, the reviewer ran the complete CI deploy-contract command, with 73/73 passing, and the effective Compose parser check, with 1/1 passing:

```sh
node --test scripts/production-rag-contract.test.mjs scripts/release-smoke.test.mjs scripts/schema-upgrade-maintenance.test.mjs scripts/schema-upgrade-host-source.test.mjs scripts/host-release.test.mjs scripts/host-release-transport.test.mjs scripts/host-release-komodo.test.mjs
node --test --test-name-pattern 'effective candidate' scripts/host-release.local.test.mjs
```

The implementer's real local Compose receipt was read, not rerun: it records exact `up -d --no-deps --pull never -- web` success against a cached image under an unreachable loopback registry, no dependency service start, and missing-cache refusal. It uses a synthetic cached Redis image and proves Compose behavior, not the actual production image's business behavior. The oneoff uses equivalent `-T`: local Compose2.40.3 does not support the native Komodo2.3.3 `--no-tty` spelling. This gap is explicitly retained in the receipt and documentation. The final appended change affects only error classification and its regression, so no further Docker mutation was needed.

## Findings resolved before approval

1. **P2 — mutation acknowledgement followed by unresolved proof.** The native app config patch may succeed while complete readback is missing or changed. `host-release-komodo.mjs:110` now marks any acknowledged-config readback/guard failure uncertain; `writeFile` similarly marks post-write host-source proof failure uncertain. The engine performs no further network action on these uncertain outcomes. Regression covers full secret-config drift without serializing secrets.
2. **P2 — source image qualification boundary.** The first source container snapshot preceded the actual per-host image map. Both release and image-preparation now re-inspect all original containers after source image qualification and before the first public-file write. A mismatched original actual image fails with zero source writes.
3. **P2 — identity of already healthy targets.** Completed target services are stored in a map of exact container ID and actual per-host image ID. Every later inventory check requires those identities, so a same-tag replacement cannot silently pass. Regression rejects a replaced target and stops remaining rollout.
4. **P2 — nested uncertain recovery classification.** A known failure may cause exactly one read-only compatibility oneoff. If that oneoff has an unknown outcome, `host-release.mjs:87` now propagates uncertain to both final receipt and thrown error, leaves recovery unknown, and sends no further requests. The saved red test reproduces the previous misleading final failed state; the final regression passes.

The identity and classification corrections retained tests-before-fix red logs. The failure model was updated before these fixes. No reviewer edits were made to implementation files.

## Reviewed invariants

- The driver has a separate sealed same-schema format and requires identical formal runtime version, package tarball/integrity, protocol, native13 schema/hash and all48 product migration names/checksums. It derives committed metadata, verifies the installed formal package, compares both hosts' DB-free metadata, and checks actual full-visibility read-only DB provenance throughout. It does not execute a migration or backup.
- Exact source acceptance and source/target OCI audit bytes are hashed into the plan. Actual host images require the audited index RepoDigest, Linux/amd64, complete ordered audited RootFS diffIDs and compatible Descriptor; the daemon's actual ID is recorded and compared with every container. Config digest is not assumed to equal image-store ID.
- Only regular tracked public Compose bytes can reach native `WriteStackFileContents`; effective Compose comparison permits only app image and pull-policy changes. Environments, security, mounts, commands, ports and gateway configuration stay equal. Full production config remains in memory and is compared on every guard; it is never persisted.
- Stack, server, source file hash and idle procedure/action state are checked. App Git/registry accounts must be empty; no credential discovery, new login, remote Git clone, arbitrary file path or Core config/source write is added. Native file-write receipts enforce exact target ID, operation `WriteStackContents`, Complete/success and exact GetUpdate reread. The only config patch fields are branch, commit, auto_pull and exact extra_args.
- Online preparation is explicit, one app at a time, pull-template-only then native PullStack db-migrate, target cache verification, and exact accepted source restoration. Config and original container identities remain unchanged; no stop/deploy is allowed. Partial/unknown preparation stops without speculative restoration or replay.
- Normal release requires qualified caches before staging, then target `pull_policy: never`, `auto_pull:false`, and `extra_args:[--no-deps,--pull,never]`. Both old Workers stop before any new Web. Two fresh zero live-lease/prepared snapshots precede rollout. WebA, WebB, WorkerA, WorkerB are deployed and made healthy in order; new WorkerA's legitimate leases do not block WorkerB. Original and completed-target identities remain locked.
- Unknown submissions stop network work; known failures may only classify recovery via a fresh read-only state check. No automatic rollback, repeat clone, retry, restore or generic rollout exists. CLI receipt creation is exclusive and errors/progress contain no raw service logs, config/env, credentials, prompts or memory text.
- CI owns the new contract/parser checks. The existing generic trigger remains fail-closed for host/pinned sources; changing its checkout to the exact manifest output does not unlock broad ResourceSync/procedure rollout.

## Remaining release constraints

These are concrete execution gates and disclosed limits, not unresolved implementation defects:

- The designated release owner must independently verify exact target CI success, exact image audits, accepted source evidence and concrete per-stack manifest plan. The URL-shaped CI declaration alone is not external evidence.
- Native idle checks plus an exclusive local receipt do not provide a distributed lock. The parent remains the sole production executor and must serialize manual and CI entrypoints.
- Core's unchanged read-only SQL oneoff retains its existing pull policy and remains a registry/availability dependency. The no-pull release guarantee applies to the new app target path.
- Native file writes are not atomic filesystem transactions. A known partial or uncertain mutation requires resolving its saved update and separately reviewing a narrow recovery; the failed receipt must remain intact.
- A completed driver receipt must be followed by actual public HTTPS version/readiness/dependency health and audited public-asset checks; available authenticated smoke should be labelled accurately. No provider/business, production isolation or long-soak claim is made here. Existing paused3.5.3 observation remains untouched.
- Permanent desired-resource/CI integration remains separate; do not reenable the legacy broad rollout because this driver passed.

## Evidence hashes

| Artifact | SHA256 | Provenance / result |
| --- | --- | --- |
| `/tmp/host-release-independent-final-green.log` | `4fc877d8ae33bfe530ccdc628e80c12b75fe67145c597a4504b0566905a45c1e` | independent reviewer, exact HEAD: 73/73 |
| `/tmp/host-release-independent-parser-green.log` | `dc79bd8bc40ebc2eefb1e559a651eb9c5058915afbe7c54d5caad13533643870` | independent reviewer, exact HEAD: 1/1 |
| `/tmp/host-release-final-contract-green.log` | `eb25967fb3d0bce0d94863c1bab1d829e56f8d60226cc6677d8d9731d9a5ba22` | implementer, exact HEAD: 73/73 |
| `/tmp/host-release-compose-green.log` | `fff3edb5b879d5c15c90fae20bd1c5426d721ba2eb6b9c15bc0bcf13869522fb` | implementer: 2/2 local parser and real Compose contracts |
| `/tmp/host-release-compose-contract.json` | `bee9c6ecd40536ceb83553144002b44ac035814517e8ea63ad2206228bff0e7a` | implementer real local Docker receipt, independently read |
| `/tmp/host-release-identity-review-red.log` | `c22cd028eb2285fe20dc4f81c97022bd55663d80fe66c0c2dc69ac8ad4935b68` | tests-before-fix: 14 tests, 2 expected failures |
| `/tmp/host-release-classification-red.log` | `2ced30f36cf0caf3485dcfa133c3dbd10aa3ffaeae4bd78405f3910ced0879c7` | tests-before-fix: 11 tests, 1 expected failure |

Machine-readable binding: `/tmp/lingxi-same-schema-host-release-independent-review.json` — SHA256 `66968bcbc1c01fa007ac7ebbe227d0a3b1caf5d03683bde0f7ef2e02e3b2265e`. It includes the exact SHA256 of every changed file.
