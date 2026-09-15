# Komodo production

Komodo v2.3.3 is the only production deployment control plane. `aly` runs
Core and MongoDB; `txy2` is `shanghai-a`, and `txy` is `shanghai-b`. Periphery
runs as a systemd service on all three hosts and connects outbound to Core.

`resources.toml` owns the LingxiLoop stacks. Runtime variables and secrets are
stored in Komodo after being supplied from Sigillo; no `.env` file is committed.
The release workflow pins immutable images, syncs this resource file, and runs
the ordered `lingxiloop-production-rollout` procedure.

`/opt/apps/wegolibrary`, its Compose project, images, containers, and network
are outside Komodo and must be preserved. Memos and all Arcane resources are
retired and must not be recreated.
