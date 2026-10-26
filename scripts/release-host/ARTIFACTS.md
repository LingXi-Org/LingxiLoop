# Registry image distribution

Image preparation has one transport: immutable registry references through the
separately approved Docker loopback proxy `127.0.0.1:17890`. Installed host policy
must explicitly use `artifactTransport: "registry"`; the old `r2` policy is
rejected. Bootstrap must update policy and the exact tested executor together.
CI records the full OCI index/platform/config/layer proof. It no longer saves,
compresses or uploads image archives. Each pull has a180-second command budget;
source images must already be qualified locally before preparation. A missing
proxy fails before pulling. Unknown pull replies are reconciled by inspecting
the immutable cache identity; no archive fallback, Docker load, mutable tag or
business-container replacement is used during qualification.

`image-identity.mjs` remains the single identity verifier, including Docker29
containerd index IDs. A config digest must not be confused with the daemon's
local index/platform ID. Actual pull qualification uses that same verifier and
the installed pinned executor Node binary. `scripts/release/run.sh route-pull
 a|b <qualified-manifest.json>` emits timing/cache/identity evidence; append
`query` for read-only reconciliation. Missing canonical references do not prove
a cold layer cache. Never delete cached production images to create a benchmark.

Historical private completed archive-load receipts and validated raw OCI proof
remain readable for source recovery images. The receipt reader cannot download
or load an archive. The old host part-upload/status RPC and downloader/loader
have been removed. The controller's historical image-part endpoint is now
GET/HEAD only; it cannot publish new image parts. Old Workflow relay code is
retained solely as a frozen test fixture for legacy recovery semantics.

This retirement does not remove R2 buckets, historical bytes, release receipts,
database backups, or retained business static assets. Database backup and
restore qualification keep their existing private archive path and data gates.
