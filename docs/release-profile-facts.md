# Read-only bootstrap profile facts

`scripts/release/bootstrap-host/profile-facts.mjs` is a standalone Node 22/24
module. It accepts only `a` or `b` on stdin, optionally followed by whitespace;
additional command arguments are rejected. The designated integrator supplies
the existing authorized host transport and executes it. This change does not
install or execute the collector on production.

```sh
printf 'b\n' | /opt/lingxi-release/node-v22.23.3-linux-x64/bin/node scripts/release/bootstrap-host/profile-facts.mjs
```

The fixed project inventory is main runtime A and WuKongIM on A, and main runtime
B, Open Notebook, and gateway on B. Docker container labels must agree with the
fixed `/etc/komodo/stacks/<project>/deploy/komodo/<project>/compose.yml` and `.env`
paths. Labels cannot select a different file or command. Docker executions use
an argument array and the fixed `/usr/bin/docker` binary.

Each target returns `status: observed` or `status: unqualified` and finite
`reasonCodes`. A target failure preserves facts from other targets. `complete`
means all requested target probes completed; it does not approve migration,
backward compatibility, cold WAL recovery, or gateway hot drain. Missing image
revision labels remain explicitly unqualified in `sourceRevision`; a local image
ID is never called a config digest without OCI graph evidence.

The output includes:

- Effective Compose `configurationHash`, using the host executor's canonical
  selected-service fingerprint. Image and pull policy are excluded; resolved
  secret values participate only in the in-memory hash. Declared environment
  and array commands must match the running container.
- Original container IDs, Docker local image IDs, descriptors, repository
  digests, platform, full rootfs diff IDs, and every actual mount, including
  anonymous volumes, driver, mode, propagation, and read-only status.
- Main runtime's installed public package versions and native schema hash,
  source commit, and packaged product migration names/checksums. These describe
  image contents; the separate database state probe establishes installed
  PostgreSQL ledger state.
- WuKongIM's build-info hash, upstream/fix commits, binary hash, and health exit
  status. No cold storage inspection is claimed.
- Gateway's actual numeric Nginx version, raw version-output hash, successful
  syntax test, effective `nginx -T` stdout hash, and health exit status.
- Notebook's actual RAG readiness/schema marker, namespace, active database,
  control database, canonical `INFO FOR DB` hash, pending command count, selected
  active-generation fields, and fixed source-file hashes. The active pointer is
  reread to detect a concurrent generation change. Surreal's actual binary
  version, version-output hash, image identity, and all mounts are retained.

Notebook uses only fixed SELECT/count/INFO statements against the single shared
private Docker network's inspected Surreal address. Existing credentials stay
in memory. The collector never emits environment values, credentials, raw
database definitions, command rows, raw Compose output, raw Nginx configuration,
raw build-info contents, or arbitrary upstream errors. It performs no database
writes, service stops, image pulls/builds, installations, or configuration writes.

For transport integration, import `collectProfileFacts(side)` or inline this
self-contained ESM and invoke that export. Tests inject Docker and HTTP
boundaries without running production commands:

```sh
node --test scripts/release/bootstrap-host/profile-facts.test.mjs
```
