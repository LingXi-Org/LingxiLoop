# LingxiOS provenance

- Repository: `https://github.com/lyyzka/LingxiOS`
- Commit: `29aec516f92612e4860d372710e88f38d2e53528`
- Vendored: `src/`, `kernel/`, `test/`, and TypeScript/npm build metadata
- Excluded: the upstream `server/` integration snapshot, database example schema,
  generated `dist/`, dependency directories, and VCS metadata

LingxiLoop runs this snapshot directly from source and keeps product-specific
authorization, approvals, storage, messaging, knowledge, learning, Canvas,
memory, and LLM-ledger behavior in `server/src/agent-os` adapters.

Local runtime changes are deliberately limited to full `sourceVersions`
refresh checks, trusted product context/final-message extension hooks,
validated assistant-stream part closure, forwarding validated lease proof to
the product ActionExecutor, and per-call compaction telemetry for the shared
LingxiLoop LLM ledger. They are covered by vendored tests.

The upstream package metadata declares the project under the MIT license. The
upstream snapshot did not contain a standalone license file at this commit.
