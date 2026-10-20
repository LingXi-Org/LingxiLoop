# Conversation and visualization product49 production recovery

Accepted production commit: `cf4a299bcfb44d7e7ed74a250ea1404588a4e901`, runtime3.5.8/native13/product49. Recovery completed at 2026-10-20T18:06:56Z; four real containers are healthy with zero restarts. Four public health/readiness/dependency/version routes subsequently returned200 and the expected commit.

The execution environment disconnected during the original release. On recovery, workspace files remained but `/tmp` receipts and the original local process/session were unavailable. Public Komodo reads confirmed that migration0049 had already committed and A Web had already deployed; B Web was still the old version and both old Workers were stopped. We did not replay migration or start old Workers.

The independently reviewed, one-use `resume.mjs` reuses the frozen52ee public transport, native read-only state command and provenance checks. It rechecked the exact checkpoint and committed host files, then deployed B Web, A Worker and B Worker in that order. It preserves complete configuration/security comparisons in memory without logging secrets, verifies native terminal receipts and readiness, and stops without automatic retry on uncertainty. No pull, stop, migration, permissions change or product configuration write is present. The reviewed public cache-refresh path is used for current host-file reads.

Native references:

- Original migration: `6ad7a904e06d5e1f798378f8` — Complete/success true, product49/native13.
- Original A Web: `6ad7a927e06d5e1f79837905`.
- Recovery B Web: `6ad7ad2de06d5e1f798379d7`.
- Recovery A Worker: `6ad7ad5ce06d5e1f798379e6`.
- Recovery B Worker: `6ad7ad8de06d5e1f798379f2`.
- Final full provenance: `6ad7adbde06d5e1f798379fd`.

The recovery has12 actual newly submitted native terminal receipts: three deployments and nine bounded read-only database state jobs. This is a new interrupted-release acceptance, **not** a reconstruction or assertion that the original uninterrupted36+1 acceptance completed. Prior cf4 image qualification was observed before the environment restart, but its temporary artifact is unavailable; later source qualification must identify its own exact evidence and scope.

`public-health.json` retains an earlier Python urllib403 attempt, followed by ordinary curl success with default TLS verification; no TLS, network or authentication bypass was applied. Native Worker readiness implies shipped startup checks completed; a complete production isolation/fault-injection matrix is not claimed.

Delivered work includes PR250/254 bounded visualization startup and visible-history initialization, PR252 rounded-gutter/zoom correction, PR251 conversation loading and reversible personal-list removal with0049, and PR253 bounded numeric chart contracts. PR256 and the public runtime3.6.0/product0050 delivery integration remain separate releases. Original provider quality red cases remain tracked in#247; no production performance percentile or additional browser/provider coverage is claimed.
