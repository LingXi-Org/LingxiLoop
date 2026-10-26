# Trusted Compose/environment snapshots

This optional trusted policy mapping selects fixed Compose/environment pairs by
the registered descriptor's existing `configurationHash`:

```json
{
  "envFile": "/fixed/app/.env",
  "composeFile": "/fixed/app/compose.yml",
  "configurationFiles": {
    "sha256:<accepted-64-hex>": {
      "envFile": "/fixed/app/.env.release-source-197e",
      "composeFile": "/fixed/app/compose.release-source-197e.yml"
    },
    "sha256:<approved-forward-64-hex>": {
      "envFile": "/fixed/app/.env.release-forward-sdk12",
      "composeFile": "/fixed/app/compose.release-forward-sdk12.yml"
    }
  }
}
```

The mapping belongs inside a local `policy.targets[target]`. Keys must be full
SHA-256 configuration fingerprints. Each entry contains exactly `envFile` and
`composeFile`: fixed normalized absolute paths in their respective original
file directories. The pair is selected together. The manifest supplies only an
approved hash; its own path, environment or mapping fields are never consumed.
When mapping is enabled, source, forward and recovery hashes must all be present
before manifest registration. Unknown hashes fail before writer shutdown. With
no mapping the original `local.envFile`/`local.composeFile` behavior remains unchanged.

Preparation renders and checks all three descriptors against their selected
snapshots. Apply, source restoration, compatible recovery and prepare observation
use the same selection. The fixed migration service uses the explicit forward
descriptor. Independent database observation keeps its separately trusted
database environment reference; this feature does not rotate DB credentials.

Mapped targets additionally compare rendered configuration fingerprints and the
actual inspected container environment. Expected values are the qualified
image's baked environment merged with the resolved Compose environment; the
comparison checks the full resulting key/value set, including absence of old
or new variables. Everything stays in private process memory. Errors and
receipts contain only fixed codes and the approved configuration hash, never
environment values. Null/unresolved environment entries fail closed rather
than inheriting an unspecified caller environment. Image identities, volumes,
health, schema/protocol and lease checks remain in force.

Same-image unknown apply cannot be called complete merely because the original
containers are healthy: actual environment proof is required. Observation does
not repeat an `up` intent. A configuration witness in the observed completion
can be used by later phases. Shutdown uses the proven configuration of this
release, not a forward direction left in NodeState by another release. Pending
or partially failed service updates without a matching completion/configuration
witness remain unknown and reserved; they do not grant a guessed stop direction.
The existing automatic compatibility recovery after a known startup failure
retains its original context, but first proves each service against the completed
forward up step or untouched source snapshot. An unknown up receipt or actual
environment outside those approved snapshots keeps ownership; the
`knownApplied` marker alone does not bypass that evidence or replay forward up.

## Root's preparation steps (not executed here)

1. In the existing private host context, preserve both original `.env` and
   Compose bytes as separately named source snapshots in their directories. Create each
   exclusively, private mode 0600 and the existing trusted owner; fsync file
   and directory. Do not overwrite source/recovery files or the original
   observer environment. Never commit or print snapshot contents.
2. Create a second exclusive private pair for the approved forward release.
   The forward Compose snapshot must explicitly wire the approved vision
   variable into both Web and Worker environments; changing `.env` alone is
   insufficient when the original Compose file has no reference to that key.
   Change only the approved public environment setting
   `OPENAI_VISION_MODEL=Qwen/Qwen3-VL-32B-Instruct`, preserving all other private
   values and dotenv quoting. This document does not perform that mutation.
3. Render the fixed Compose project with each selected file pair using
   `config --format json`; capture stdout inside a private process. Run the
   exported `configurationFingerprint(config, localTarget)` in
   `adapter.mjs`, printing **only** its hash. This is a resolved Compose hash,
   not the raw `.env` file hash. Keep images/overlays and named volume bindings
   consistent with the existing accepted preparation. No pull, build or up is
   needed to compute it.
4. Require the source result to equal the accepted hash. The supplied local
   handoff records currently name A
   `sha256:7451a19bb0cdc3704475aa04d7c62c2e9e8ce8930153718c3236c3a179f60f31`
   and B
   `sha256:4f0b61e05754cb926423b5ae00444e285972a1d148491c41e6d681541b2659b8`.
   These are historical input references, not new live qualification. Verify
   privately that both Web and Worker rendered environments consume the new
   vision value, and that the forward fingerprint differs as expected. If the
   fixed Compose file does not consume that setting, stop instead of claiming
   that adding a line to a private file changed the service configuration.
5. Approve each resulting hash/file pair in the trusted local mapping. Preserve the
   accepted source hash/pair in the source descriptor and in recovery when its
   contract remains compatible. Bind the forward descriptor and public target
   configuration version to the newly qualified fingerprint. A different
   schema/protocol recovery still needs its existing independent qualification.
6. Integrate and qualify the fixed executor code, freeze the final Ops once, and
   run the existing prepare/maintenance/apply/verification protocol through the
   designated integrator. Changing only files/policy or producing staged
   artifacts is not deployment or acceptance. This module does not install
   snapshots, change credentials/networking or publish a business release.

Tests use private synthetic files and a Docker boundary fixture. They exercise
source/forward/recovery separation, same-image false-completion prevention,
read-only completion proof, configuration drift, direction evidence and forward
migration selection. No production environment file is read or changed.
