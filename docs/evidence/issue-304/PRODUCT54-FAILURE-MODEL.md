# Product54 persistent presentation contract

Recorded before implementation. Runtime remains the formal 3.8.2 package / native14.

- Old raw memory receipts are indistinguishable from new receipts without host provenance. NULL must never imply process; no historical rows are backfilled.
- First product binding does not prove first native creation. Only a non-deduplicated published ingest/enqueue receipt or a verified marked parent/root may establish version1.
- Ordinary context restoration, repeated ingress and binding conflicts must preserve the first stored value, including NULL. An ingest-to-binding crash, or context winning that race, safely remains NULL; retry cannot manufacture provenance.
- Tenant/principal/conversation/session/thread mismatches cannot read or overwrite provenance. Delegates inherit only through the runtime-owned parent/root identity, after host authorization.
- Live projection, first read, reconnect and activity paging must use the same persisted marker. Marker1 classifies native memory activity as process; explicit deliverable envelopes remain results; old unmarked rich values stay visible.
- 0054 must be one transactional additive nullable-column migration from exact formal3.8.2/native14/full53. A ledger failure rolls DDL back. Earlier SQL/checksums and native records remain unchanged.
- Starting from public52 requires unchanged0053 followed by0054. An older full53 reader rejects a full54 inventory; rollback must retain the54-compatible reader, not remove migration or stamp older provenance.
- Database tests use only a dedicated local test database and synthetic records. No GitHub, production, private conversation or real index operation is authorized here.
