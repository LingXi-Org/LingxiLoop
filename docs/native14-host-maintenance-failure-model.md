# Native13/product49 to native14/product50 maintenance failure model

This file precedes implementation. The new `native-schema-host-release/v1` profile is explicit: formal3.5.8/native13/product49 to formally published3.6.0/native14/product50, unchanged protocol and first49 checksums. It does not authorize execution or guess a release commit, package integrity or migration50 checksum. Those are bound to accepted source, public package resources, committed inventory, CI and immutable image audits during planning. The existing same-schema13 and product48→49 contracts stay intact.

| Failure | Required behavior |
|---|---|
| Arbitrary version/protocol, altered history, missing backup or old12/46 backup | Reject plan before remote work. Native mismatch cannot use ordinary/product-only formats. |
| Unaccepted source, wrong formal lock/package, unknown target image/platform/layers, stale host source or changed security/env/volumes | Refuse staging/drain; keep current exact evidence guards. |
| Image preparation or staging loses an acknowledgement/readback | Persist known native ID, classify uncertain, stop all subsequent requests; never retry clone/pull/write. |
| Web background writer still alive, ineffective stop, live native/capture/outbox lease, prepared transaction or other DB client | No backup/migration. Stop both Workers and Web, verify original IDs/PIDs, two full read-only/visibility barriers. |
| Backup stale, reused attempt, incorrect source/count/provenance, insufficient capacity, failed restore or owned cleanup | No migration. Fresh snapshot/dump/isolated restore must execute for this attempt; old receipt/dump never substitutes. Preserve dump and exact owned cleanup boundary. |
| Backup accepted but receipt ID/op/target (including Core ID drift between host guard and submission) or fresh terminal result unavailable/contradictory (success or start/end timestamps), or an undocumented nonterminal status | Uncertain, no further request or migration; retain native update ID, no automatic retry. Keep70min bound for3900s remote backup. |
| Metadata or source/lease drift after backup | No migration; repeat full barrier and exact target metadata/images before the single migration. |
| Migration before all4 stopped or backup verified, migration twice, persistent drain env | Reject. Drain flag belongs only to one appA public db-migrate oneoff. No private runtime API/native SQL copy. |
| Migration failure before commit | Fresh exact13/49 can classify source unchanged, but automatic restart/retry is forbidden. |
| Native14/product50 committed but later failure | Fix-forward. Never start old13 binary or use a historical native15-down script. |
| Migration outcome or classification state unknown | Preserve update ID, classify unknown/uncertain and make no more requests. |
| Unhealthy/replaced target, policy drift, wrong image or schema/inventory | Stop subsequent recovery; verify WebA/B before WorkerA/B, keep completed target identities, final fresh state. |

Owning evidence: extend existing engine/adapter/backup/transport contracts; real source-profile backup fixture and affected product native016 integration remain separately necessary before production. No browser/provider matrix or production fault injection is part of this PR. Target3.6.0 is not installed or claimed qualified by synthetic tests. Snapshot restoration proves source restorability, not target migration success. Operational source/target plans are deliberately absent.
