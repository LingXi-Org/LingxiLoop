# Historical Visualize recovery (#670)

Visualize is retired. New explanations use the editable Design canvas. The
Visualize skill, native tools, guest iframe/bridge, HTML resources, interactive
state writes and authoring/export runtime are removed. Old runtime routes and
hashed resources return HTTP 410, including retained static hashes. No current
message mounts or executes the old frontend.

Historical messages keep their body and passive references. Their archived card
explains that interactions are unavailable and offers an authenticated source
archive. `GET /api/im/channels/:id/visualize/archive` requires the historical
`path` and delivered `sourceMessageId`. It returns a JSON attachment, never an
executable HTML page. The archive contains the original message body and source
identity, document HTML as an inert JSON string with hash/version/provenance,
the caller's own saved state and page metadata. Page metadata is bounded to
1,000 entries with explicit truncation. Other users' state, page tokens and
interaction grants are excluded.

Archive acquisition rechecks current company, conversation, project and teacher
room access and the original assistant/run/literal-reference binding. A revoked
or missing original source cannot be represented as a recoverable document.
This export is source recovery for inspection and manual migration; it does not
convert old interactions into an editable Design document or claim fidelity of
an automatic migration.

PostgreSQL `im_visualize_documents`, `im_visualize_states`, `im_visualize_pages`
and `im_visualize_gestures` remain intact. Existing migrations, including
`0046_visualize.sql`, are immutable; this retirement adds no deletion or DDL.
Operations must preserve these tables and the underlying artwork in backups.
Running old executables against the archive is not a supported recovery path.
Rollback still follows [RELEASE.md](RELEASE.md); never roll back schema or erase
persistent content to restore an older binary.

The only retained source adaptation is a passive directive parser under `shared/`.
Its Apache-2.0 license and fixed-commit provenance live in
[`third_party/visualize-compat`](../third_party/visualize-compat/README.md). The
full original implementation remains available in Git history at
[`91f0ba03`](https://github.com/LingXi-Org/LingxiLoop/tree/91f0ba03/third_party/zcode),
not in production packages.

Shared formula rendering remains under `shared/artifact-math*` and the Design
and Slides owners. `buildArtifactMath()` returns bytes to the owning editor;
it no longer writes a Visualize directory. Design packages its offline renderer,
installed KaTeX fonts and online math loader under its own hashed assets; Slides
retains its separate formula compiler/export/font handling. Build Design directly
with `npm run build:design-editor`; `npm run build` does that before the web SPA.

Focused checks include the retained archive/parser/UI tests, production image
and CI contracts, Worker retirement routing, Design/Slides editor packaging,
shared math rendering and export tests. Historical browser evidence records the
version it actually tested and does not qualify the current release. Use the
current issue's evidence and [release procedure](RELEASE.md) for acceptance.

## In-flight runs and release gate

The native SDK pins each admitted run to its harness hash. This release changes
that harness. A previously admitted run cannot transparently resume in the new
Worker: the formal context loader rejects it with `harness version mismatch;
resume with the pinned deployment or drain the old run`. Never rewrite the
stored pin, add a compatibility executor, or delete historical records to pass
this boundary.

The designated sole production integrator must first stop new admission using
the existing release controls and drain affected `queued`, `leased` and `waiting`
runs on their pinned deployment. A waiting run requires its normal authorized
continuation or an explicitly authorized cancellation; it must not be silently
discarded. Because the public run projection does not expose harness hashes,
the conservative gate is zero nonterminal runs across the deployment before
cutover. Keep admission held until that zero inventory is recorded and the
new compatible Web/API and Workers are ready. If draining cannot finish, the
release remains blocked on the old compatible deployment.

For a read-only inventory, sign into the existing **platform** administrator
gateway and run this snippet in its browser console. It uses the current
authenticated session, follows every page, emits counts and run IDs only, and
makes no state changes. Do not substitute a company-scoped account or a 24-hour
filter: both can omit affected runs. An HTTP error or pagination limit blocks
the gate; never treat an incomplete inventory as zero.

```js
const inventory = { checkedAt: new Date().toISOString(), counts: {}, runs: [] }
for (const status of ['queued', 'leased', 'waiting']) {
  let cursor
  inventory.counts[status] = 0
  do {
    const query = new URLSearchParams({ status, limit: '100', sort: 'id' })
    if (cursor) query.set('cursor', cursor)
    const response = await fetch(`/api/control/platform/resources/agent-runs?${query}`, {
      credentials: 'include', headers: { accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`Incomplete retirement inventory: HTTP ${response.status}`)
    const page = await response.json()
    if (!Array.isArray(page.data)) throw new Error('Invalid retirement inventory response')
    for (const run of page.data) {
      if (run.status !== status) throw new Error('Run inventory changed; repeat after admission is held')
      inventory.runs.push({ id: run.id, status, requestVersion: run.requestVersion })
      inventory.counts[status]++
    }
    cursor = page.nextCursor
  } while (cursor)
}
inventory.clear = inventory.runs.length === 0
console.log(JSON.stringify(inventory, null, 2))
```

The native regression in
`server/src/__integration__/runtime-retired-visualize.test.ts` persists a real
historical metadata-only activation, disconnects before its acknowledgment is
journaled, and reconnects the current control plane under the original fenced
lease. It proves the harness mismatch blocks context loading and leaves body,
source and saved state intact. A separate explicit trusted `HostPort` candidate
verification proves the removed registry marks the activation unavailable;
only an honest retirement notice can commit `unsupported` with a `partial`
outcome. This is a native boundary test, not an automatic migration or resume
feature. The production release gate remains the required drain above.
