# #408 investigation result — 2026-10-24

The generation defect is **not reproduced** by this bounded sample. This draft contains investigation fixtures and evidence, not a product fix; #408 must remain open. The product, authorization, sender/run binding, #398 context implementation, dependency locks and other owners' files are unchanged. No merge or deployment was performed.

Baseline: `1725df4c7751f9ff38fe1e3d3983b465393d9d8c`; branch `fix/408-current-agent-identity`. Linux, Node 24.19.0 (repository recommends Node 22), formally installed LingxiOS 3.8.11. Only isolated loopback PostgreSQL `lingxiloop_identity_test`, Redis DB 5, synthetic participants and the recording WuKong fixture were used. The live provider used existing environment credentials and GLM-5.2, which is not evidence of production-model parity.

## Checks completed

| Check | Result and boundary |
| --- | --- |
| `node e2e/server/agent-identity.mjs` | 1/1 pass, 8.47 s runner wall time; three scripted turns, correct current persona, attributed peer history in final model items, sender/session ownership and three measured ledger rows. This verifies wiring, not model semantics. |
| `node e2e/server/agent-identity.mjs --live` | Final candidate: 1/1 pass, 22.12 s; intro → lesson planning → practice, including an attributed first-person quote. Three successful native runs, one reply per sender, own name present, tested wrong-self-claim patterns absent. Three measured calls: 48,069 input / 227 output tokens. No inference about all possible identity failures. |
| `E2E_CDP_URL=http://127.0.0.1:9227 E2E_TELEMETRY_DISABLED=1 node_modules/.bin/e2e run --config e2e/issue-408/e2e.config.ts` | 1 passed / 0 failed / 0 skipped in Chromium via official e2e 0.17.0 + web 0.12.0; 10.22 s. Actual conversation components retain sender labels and body through JSON replay, including deliberately inconsistent milo/“我（溯源）” synthetic content. No API mutation or real model inference in this browser fixture. |
| `node_modules/.bin/tsc -p server/tsconfig.json --noEmit` | Pass. |
| `node_modules/.bin/tsc -p e2e/issue-408/tsconfig.json` | Pass, includes the existing DOM extension declarations used by imported product components. |
| Focused Biome lint | Pass: new integration, launcher and browser fixture/config files. |

Machine evidence is in [validation.json](validation.json); [browser.png](browser.png) shows the synthetic renderer result. The browser runner recorded the base HEAD because fixture files were untracked during execution; file hashes in the evidence bind the checked source to the committed candidate. Tests were completed before the final evidence-only commit; no assertion that CI has passed that commit.

## Preserved unsuccessful attempts

- Dependency install: original official 3.8.11 package download returned HTTP 401. After explicit user authorization, read-only configuration audit confirmed root `.npmrc` uses the existing `NODE_AUTH_TOKEN`. Exactly one bounded retry with the same identity/source/lock and `fetch-retries=0` succeeded (1,509 packages / 33 s). No credential replacement, permission change, alternate source or cross-environment package copy. Incomplete install cleanup/cache errors also preceded that confirmed rejection.
- Initial scripted setup failed because an explicit monetary budget requires token prices. The isolated scripted launcher now supplies nominal test prices; the product pricing code is unchanged.
- Initial live attempt failed before a response with `Model request failed (network)`. The launcher had omitted the environment's existing proxy settings. Passing those same settings and enabling Node's environment-proxy support restored approved egress; the three-introduction baseline then passed.
- A closer quoted-history run completed all three identities correctly but failed a fixture assertion requiring exactly three successful calls. There were four measured calls: nova had one `Model request failed (protocol)`, then recovered. Final assertions preserve failed calls, require unique native call IDs, enforce the per-agent budget, permit only measured protocol repairs, and require each agent's final call to succeed. This is not an identity-defect reproduction.
- The first ledger-assertion update queried nonexistent `call_id`; corrected to the actual `extras->>'callId'` schema. Scripted and live checks then passed. Reports now start incomplete so a setup/query failure cannot leave a stale success report.
- Browser setup first failed collection because config-relative paths were wrong, then rejected an output path outside the config root. Fixed within the dedicated fixture; the actual browser run then passed.
- Broad `tsc -p e2e/tsconfig.json` failed in existing `e2e/react-delivery/recovery.e2e.ts` and imported alias/type declarations. Those files were not modified. Focused fixture typechecking initially omitted the existing `Element.moveBefore` declaration, then passed with `src/**/*.d.ts` included.

## Remaining boundary

Unrun: memory/compaction identity injection, restored long conversations, production-model parity, explicit sage handoff, full suites, production health checks and deployment. Browser verification is a component fixture, not a production end-to-end replay. The source hypotheses and falsifiers are in [FAILURE-MODEL.md](FAILURE-MODEL.md).

The user stopped additional review/reproduction workflows at 08:36 UTC. No independent review was started, and no further model or regression runs were started after that instruction arrived. Existing running checks were collected. Do not block the draft on an extra review, and do not mark the original bug fixed without its missing evidence.

Reproduction requires installed locked dependencies, Docker, and Chromium. The launcher ignores developer dotenv/database overrides and preserves only the existing provider variables when `--live` is explicit. Start a local Chromium CDP listener for the browser command or use the engine's installed browser. Stop task-owned containers with `docker compose -f e2e/server/compose.yaml stop`; this retains fixture data.
