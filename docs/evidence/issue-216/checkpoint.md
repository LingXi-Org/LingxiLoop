# Issue 216 qualification checkpoint

Incomplete development checkpoint; do not merge, deploy or close on this evidence. Both phases remain one delivery. The designated integrator coordinates formal upstream publication and final exact dependency/lockfile updates with issues 215/218.

Base main: b7b165fd704f8d1f22fe8b70b47bfc8d70e02275, deployment image pin 2ea8615c17c9ed11b769c83c699719dc01c11ee4, runtime 3.5.6, product migration 46. This branch proposes product migration 47 and native schema 13. Old Web background writers and Workers must both drain; stopping Workers alone is insufficient.

Source qualification uses an npm-packed native LingxiOS candidate through public exports. All other dependencies are restored from the existing lockfile. The committed dependency remains published 3.5.6 until the integrator publishes the coordinated official version; this draft cannot pass release CI or deploy in its current dependency state.

Completed: server typecheck against the source package; the new deterministic product case proves actual model-input inclusion, cross-room/Agent identity, real course binding, shared/tenant/principal isolation, version correction, control restart and forgetting. Baseline native-memory + memory-summaries passed 2/2 (36653 ms). The first candidate integration run exposed outdated migration-count expectations and a grouped-room fixture selecting the new shared course scope; those assertions now explicitly retain session isolation and account for migration 47. Rerun pending.

Real provider: the initial launcher omitted existing proxy/CA environment variables; fixed without weakening TLS. The existing baseline teacher test then failed with the DeepSeek test model exposing internal process text. Under the existing authorized GLM-5.2 route and checked CNY 8/28 per-million rates, the same baseline teacher test passed 1/1 in 25783 ms. The candidate long-source/semantic acceptance remains pending; real native embedding calls and explicit personal writes were observed, but no overall pass is claimed.

Pending: rerun migration and owning product coverage, complete real provider long-source/semantic/forget checks, browser screenshots, final review, official release pin and exact-lock qualification. No package publication, production migration, deployment or issue closure was performed.
