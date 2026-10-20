# Conversation loading, personal list removal and visualization integration

This candidate combines PR251 (`9df5e9fbd3e2c58be4d3217404e13c611b1087de`), PR253 (`95985d7bbb8e2ff0c2d3a6bc1545cc6882e58f28`) and only the two approved #246 commits from PR252: `dea622d645876031b398b00ba3c7f53358cdfe94` and `62b6a19a4decbfe815ea5678a606baa086c0a6ac`.

PR252's other ancestors contain separate #244 work and were not merged. Its fixture conflict was resolved by retaining the existing page-creation statement and adding only the `corners` fixture route. Both changed production files are byte-identical to the reviewed PR252 head. Public page contracts, host and page lifecycle code remain identical to the integration base. Independent review confirmed this boundary and found no remaining P1/P2 in the selected changes.

Existing evidence is retained without rewriting test logs:

- [#248](../issue-248/README.md): Web 73/73, final affected checks 5/5, lint/typecheck/build. Initial server integration was 43/47; only the five affected cases were rerun after correcting old assertions. The local 278→28 ms fixture is not a production latency measurement.
- [#247 numeric slice](../issue247-numeric/README.md): renderer 8/8, registry 1/1, dedicated local PostgreSQL public-tool integration 2/2, server lint/typecheck, independent review. This optional deterministic tool does not close #247 or turn historical provider quality failures green.
- [#246](../issue-246-layout/README.md): retained two-width inset red/green evidence and the 1440px CSS zoom 1.25 red/green case. No claim of native browser zoom, all devices, clipboard or complete dialog overflow coverage.

After the fixture conflict resolution, `node node_modules/typescript/bin/tsc -p e2e/tsconfig.json` passed on Node 22.23.3 with the existing formal runtime 3.5.8 dependency tree. An initial local invocation used an old 3.5.6 dependency symlink and failed on missing runtime exports; only this worktree's symlink was corrected, without installing packages or modifying shared dependencies. No additional browser or provider run was performed.

Production must explicitly apply product migration 0049 before serving the new conversation list query. It creates a personal, reversible list-removal table; shared messages and membership survive. Runtime 3.5.8 / native schema 13 remain unchanged. The product-only migration release must retain full checksum inventory, image provenance, Worker drain and native terminal/health checks. After migration, recovery is forward to a compatible product49 image, not restart of a product48 image.

This source integration record is not a deployment receipt. Exact CI, image identity and actual production acceptance are recorded separately by the sole integrator.
