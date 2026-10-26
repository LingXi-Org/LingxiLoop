# Local integration qualification, 2026-10-26

The same saved cloud environment integrated existing work without rewriting it:
release entry #516 (`4f5981b5cd953364eda05808e3cf85c5a9efd43a`), #491 plus
CAS57 source preflight (`7d7ddf2ad723484d449ecbf15b1f12abf514eca4`), #510
(`3a90e4ffd03cafe850886d843b4464f0e72046ae`), #511
(`7a043cc32162aebd8f5bac7acd5df5462322fef8`), and #517
(`5312796ed5652d4ac649f07492095df7603afe0e`). All merges were conflict-free.
This is an integration candidate, not a production acceptance record.

## Actual checks

- Latest executor control-read, runtime-patch and database-tools tests: 24 passed,
  zero skipped, 401.731 ms. Tested integration source
  `ffa14a521668ae7df0eee8f12ec01bc04225b5ac`; subsequent #517 changes only the
  message projection and its tests/evidence.
- Formal SDK **3.8.13** installed with the existing exact scoped lock and package
  registry credentials; no fixture version or SDK export substitution. Initial
  npm installation failed because the inherited cache path
  `/home/agent/.npm/_cacache` did not exist; retry with an explicit writable
  workspace cache succeeded. Original package manifests/locks were restored by
  the scoped installer and remain unchanged.
- Actual PostgreSQL product57 provenance tests: **3 passed, zero skipped**, total
  runner wall time 2,610.022 ms. A dedicated local `pgvector/pgvector:pg16`
  container on loopback port 55414 was used. The tests verify exactly one
  provenance-row CAS with no DDL/ledger/business changes; lost COMMIT response
  followed by read-only observation without replay; and refusal of retained
  checkpoints, concurrent clients or ledger name drift.
- Runtime profile/CLI boundary tests: **15 passed, zero skipped**, 4,536.514 ms.
  Both SDK checks used source `ac9d21fb2ea996d8d6e2aa0201bb0fa08a5d8c8b`.

The locked formal package is
`https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.13/4c4b353d0843064868ec6a0df0fdd57433f860fa`,
integrity `sha512-K2NFX9a6C/EIWp+wNM/zGbGCweTuQqk+UXQNA3LL/X5Cd93dnMXNYDheFLuq4gHXLkgkOoXp01YYlY2gcfTOIA==`.
These results close the missing local formal-SDK13 PostgreSQL and current
executor integration evidence. They do not qualify a future SDK version.

## Distribution and release boundary

Read-only A/B verification after the user's upload confirmed identical 56,206
byte provider files, root:root mode 0600, ordinary non-symlink files, parsable
YAML with 45 nodes. No node names, addresses or credentials were exported.
Both fixed Mihomo binary and systemd unit are absent; service LoadState is
`not-found` and ActiveState `inactive`. Docker has no configured proxies.
A Docker 29.3.1 reports live-restore enabled; B Docker 29.7.2 reports disabled.
Uploaded YAML therefore is not evidence of activated acceleration or a faster
image transfer. Actual Mihomo validation, authenticated blob/pull timing and
normal/recovery production qualification remain pending.

The next requested permission is restricted to fixed native Mihomo installation,
the dedicated non-login service user, fixed loopback-only 127.0.0.1:17890 policy,
provider loading and bounded connectivity/download measurement. It excludes
Docker daemon configuration or Docker restart. Those need separate concrete
impact approval, especially shared ingress and other B-host services.

Upstream OS PR69 (`3e9da60fca07a7b158e19385dde3973661c74179`) is separately
owned and still needs its final successful checks and formal package release.
Its dependency lock is not invented here. Issue #519 remains separately owned.
No production service/configuration/database writes occurred in this work.

## Formal SDK3.8.14 integration qualification (2026-10-26)

OS PR70 merged at `f24784b1c91a8591eeb4a921b9ac4db7bab4cb2c` after PR gate
40281567356. Exact main gate40282798553 succeeded; tag `v3.8.14` matches that
commit. Formal publish40284557881 succeeded. Registry readback:

- version3.8.14, tarball suffix `5b177d9189351a4058258e018f5033c10e901bb7`;
- SRI `sha512-kaZatUgHwW9RNckzg7yYumQ1HCCUvPLQksQvGbDdo5GO70iRsL+NV+/9Xaae82+XMzYztBO8f2klVDemzwCQ4Q==`;
- actual installed public tuple runtime3.8.14/native14/control11/kernel2/publicText3/runTrace1/assistantMessage2.

Root/server manifests and locks now pin that exact formal package; generated
scoped dependency manifests/locks match. The privileged product57 CAS and host
validation now accept exactly SDK3.8.12→3.8.14, preserving all57 migration names
and checksums. This includes OS69 while preserving #491/#510/#511/#517 work.
PR521's0058 is a separate subsequent product58 migration, not part of this CAS.

Actual disposable local PostgreSQL with formal SDK14: **3pass0skip,2.598s**.
Verified one-row provenance CAS with no DDL/ledger/business mutation, unknown
COMMIT read-only reconciliation/no replay, and refusal with checkpoint/client/
ledger drift. Fixture container and its volumes were removed after the test.
Host runtime patch/database tool tests: **22pass0skip,0.562s**. Server TypeScript
and lint passed. Final exact product CI is still required; previous SDK13 CI
and PG qualification are not substituted for SDK14 results.
