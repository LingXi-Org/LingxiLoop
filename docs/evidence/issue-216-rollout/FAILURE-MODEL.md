# Schema13 release boundary failure model (before implementation)

Base main 035a8e11; source backup dependency is the reviewed exact helper at1b0945b226. Root is sole production integrator. This work must make no production/provider requests while developing or testing.

1. Ordinary CI stops Workers then discovers native12→13, or a flag falsely substitutes for both Web processes stopping.
2. A target or source changes after planning; one host pulls an old image; an image's runtime/schema/protocol differs from its claimed manifest.
3. Stop returns accepted but the old container still runs/restarts, a duplicate service exists, or migration work is already active.
4. SQL lease/claim/client visibility is incomplete, a query times out, or other transactions appear between barrier and migration.
5. An online/old-source backup or unverified restore is accepted as the final drained recovery point.
6. A transport/poll result is unknown and a second migration is submitted, or old containers are restarted against committed47/48.
7. 47 commits but48/postlude fails; process exit is mistaken for transactional rollback.
8. A receipt comes from another target/update/attempt or untrusted log text; errors print secrets, memory, prompts or full resource responses.
9. A default invocation mutates production, credentials are copied, a long operation has no deadline, or temporary drain env persists.
10. Normal schema13→13 UI releases are forced through repeated full outages.

Contract tests will inject transport and backup boundaries, asserting exact operation order, denied transitions and zero forbidden follow-up calls. A dedicated local PostgreSQL fixture will prove the read-only aggregate/barrier and47/48 classification using synthetic state. It will not use shared55432, production, provider, or fault signals against another service. Source backup implementation stays unchanged and is imported through its public exports.
