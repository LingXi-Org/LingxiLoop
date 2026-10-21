# Native14 same-schema release support

Base: `c66e847d14f838e72d0ab19e252e6cd4e2b68a76`. The only production
code change is the supported-profile condition in `assertSameSchema`:
formal3.6.0/native14/product50 can use the ordinary same-schema format after
successful source acceptance. Existing native13 profiles remain supported.

Formal-key equality, all ordered migration checksums, accepted-source and OCI
audit byte binding, actual host image identity, public host-source/config
guards and unknown-outcome handling are unchanged. Native13→14 still requires
its separate maintenance format, full drain and fresh backup. A14→14 release
never requests backup, seed or migration.

## Local evidence

The failure model and contract cases were written before changing the guard.
Node22.23.3 was used. Existing dependencies were reused through a read-only
symlink; no install, image build/pull or production request was performed.

| Evidence | Result |
| --- | --- |
| `contracts-red.log` | Before the guard change:3 expected failures for native14 positive paths;1 negative-boundary test passed. All failures identify the old native13-only guard. |
| `contracts-green.log` | Engine, public adapter and transport:36/36 pass. Includes all50 checksum/name mutations, formal-key drift, wrong profiles,13↔14 rejection, Worker-only drain, ordered rollout and8+26 native-action count. |
| `maintenance-regression-green.log` | Existing maintenance, host-source and backup contracts:43/43 pass. |
| `compose-green.log` | Existing effective-candidate Compose contract:5/5 pass; both apps with source always/never, preserving gateway/security/environment/volumes. Only local Compose parsing ran, not the Docker lifecycle test. |
| `committed-descriptors.json` | Offline public Git sourceb477 and mainc66 descriptors: exact formal3.6.0/native14/product50, all50 rows equal, installed formal package matches. This is not a candidate image or production acceptance. |

The two `*-missing-sparse-input.log` files preserve an initial local setup
failure: the sparse tree initially omitted the existing app Compose files.
After checking out those two unchanged files, the same tests passed. No
production code was changed to address that setup failure.

Reproduce from the checkout with Node22 and existing qualified dependencies:

```sh
node --test scripts/host-release.test.mjs scripts/host-release-komodo.test.mjs scripts/host-release-transport.test.mjs
node --test scripts/schema-upgrade-maintenance.test.mjs scripts/schema-upgrade-host-source.test.mjs scripts/verify-memory-backup.test.mjs
node --test --test-name-pattern 'effective candidate' scripts/host-release.local.test.mjs
```

The parent remains the sole integrator and production executor. Exact target
CI, immutable image audit, source acceptance and the ordinary release plan
remain mandatory for the later UI release; none are fabricated here.
