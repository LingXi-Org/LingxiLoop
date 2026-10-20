# Integration dependency boundaries

Root `package.json`, `package-lock.json` and `vite.config.ts` are shared integration points. Reconcile the lock with the other release branches; do not take only one side of a conflict. All six official BlockNote packages are pinned to 0.56.0. The existing root Tiptap version stays 3.23.4; BlockNote carries nested Tiptap 3.32.0. Existing ProseMirror/Yjs dedupe is retained.

| Resolved package path | Before | Candidate |
|---|---|---|
| `node_modules/prosemirror-changeset` | 2.4.1 | 2.4.4 |
| `node_modules/prosemirror-commands` | 1.7.1 | 1.7.2 |
| `node_modules/prosemirror-dropcursor` | 1.8.2 | 1.8.4 |
| `node_modules/prosemirror-history` | 1.5.0 | 1.5.1 |
| `node_modules/prosemirror-model` | 1.25.6 | 1.25.12 |
| `node_modules/prosemirror-transform` | 1.12.0 | 1.12.2 |
| `node_modules/prosemirror-view` | 1.41.8 | 1.42.6 |
| `node_modules/yjs` | 13.6.30 | 13.6.33 |

No shared chat editor, chat Markdown, runtime implementation, credentials, grants or security configuration is changed by this branch. Since the dependency graph is shared, the integrator must verify the chat path after lock reconciliation. Vite limits the normal entry scan to index.html (otherwise historical evidence and vendored example HTML were scanned), and prebundles the official native editor packages to avoid mid-session lazy optimizer reloads.

Migration 0048 depends on the real 0047 from #216. This branch never ships that other branch's file. Local verification borrows the exact SQL at a1e51a0c, with provenance in checks/migration-dependency.md. Formal runtime OS13 validation remains the integrator's combined release responsibility.

At final handoff (2026-10-20 04:23 UTC), fetched main is `0e93870f196f0c01ddf90f1c76ffc9bc6d722391` (PR227 streaming UI/package-startup integration), newer than this candidate's tested base `0a7fd57c`. That delta changes no #219-owned implementation file, package/lock, Vite config or migration. It was inspected without rewriting the tested candidate. The integrator must validate the actual combined tree; these local receipts do not claim to cover that later main or runtime schema13.
