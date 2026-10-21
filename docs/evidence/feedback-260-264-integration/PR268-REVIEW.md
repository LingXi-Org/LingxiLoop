# PR268 independent review — GO for the supported new path

Exact API-confirmed head: `f98c63680f42d3faae6930a97a24dc3dd068e89b`.
Base: `c66e847d14f838e72d0ab19e252e6cd4e2b68a76`.
No P1/P2 finding in the reviewed change. This is a code-review GO for the new
explicit helper and bounded renderer, subject to the normal exact integration
CI/release gates. It is **not** a finding that the user's existing component was
repaired. That saved HTML was not inspected or modified, its unique root cause
remains undetermined, and #264 must remain open.

## Actual public path, not an unused API

The existing runtime calls `createProductHarness(createProductTools(...))`,
assembles that harness and passes it to `createLingxiOS`
([runtime.ts:104](https://github.com/LingXi-Org/LingxiLoop/blob/f98c63680f42d3faae6930a97a24dc3dd068e89b/server/src/agent-runtime/runtime.ts#L104)).
`createProductTools` includes `visualizeTools`; the harness includes the actual
`visualizeSkill` and groups registered tools/skills by capability. The changed
skill action list includes `visualize.sliding_window`, and the existing context
builder actually adds `visualizeHostInstructions` to eligible conversations.
Those instructions describe both the supported sliding-window action and the
two explicit host reference paths. The upstream skill body is unchanged.

The new
[`visualize-tools.ts:120–146`](https://github.com/LingXi-Org/LingxiLoop/blob/f98c63680f42d3faae6930a97a24dc3dd068e89b/server/src/agent-runtime/visualize-tools.ts#L120)
definition goes through the existing `nativeTool` wrapper, producing the public
`visualize__sliding_window` strict JSON schema and preserving agent/audience
authorization. Its execution checks cancellation, validates bounded input,
renders, validates the fragment, activates skill delivery, and calls the usual
`saveVisualizeDocument` with tenant, conversation, principal, agent, run,
requestVersion and transaction database. It returns the actual saved path and
reference. Verification authorizes/readbacks and compares the exact generated
HTML hash. Storage/authorization failures are not converted into invalid-input
success; only renderer/Zod admission errors become `no_effect`.

The existing save path still locks and verifies conversation write access,
principal/run/agent binding, current author ownership, and request version.
The existing delivery/page acquisition still requires the completed authorized
assistant reference. No new direct HTTP/guest privileged operation is added.
The two new reference paths are explicit branches in the existing whitelist,
not arbitrary filesystem reads. All three new asset files are included by the
unchanged final Docker `COPY server ./server`; the relative asset URLs resolve
inside `server/assets` under the existing production loader model.

## State and geometry

The shipped interaction script has one `base/size/inflight` state and one bounded
`end()` calculation. Packet status/color attributes, range text and the selected
packet slice all use those values. `render()` updates state and DOM, then calls
the binding synchronously before the next paint. Partial tails clamp to packet
count; completion produces an empty selection, hides the outline, stops autoplay
and disables next/play. Size changes/reset stop the timer and reset the same state.
Each script binds to its own preceding section, preserving independent instances.

[`visualize-range.js:5–71`](https://github.com/LingXi-Org/LingxiLoop/blob/f98c63680f42d3faae6930a97a24dc3dd068e89b/server/assets/visualize-range.js#L5)
requires a direct overlay child of a positioned container. It measures actual
selected element rectangles and converts their union using a 100px invisible
probe in the same containing block. It does not duplicate nominal packet widths
or gaps. Overlay/probe mutations are excluded from scheduling; child changes
refresh observation, resize/scroll/font completion schedule measurement, and
`destroy()` cancels/disconnects/removes the binding. Empty/hidden geometry hides
the old outline.

The scope is explicitly positive axis-aligned transforms and rectangular
selections, not arbitrary wrapping, rotation/skew/3D or externally transformed
outlines. Ancestor-only layout changes not observed by the subtree require the
documented explicit `update()`. The supported renderer satisfies that contract.
No host geometry, arbitrary source rewrite, saved-history mutation, sandbox,
CSP or authorization expansion is introduced. This remains a simplified batch
send/ACK teaching demo, not full TCP/loss/retransmission behavior.

## Independent limited verification

`PROBE-FAILURE-MODEL.md` preceded the probe. `public-path-probe.log` records
**5/5 passing** checks using existing installed dependencies and Node 22:

1. Actual product registry composition + native wrapper expose the exact action
   once with strict schema, skill action and host instructions.
2. Actual action parsing/authorization/execute/verification invokes activation,
   scoped save/readback and produces the same bytes as the actual renderer.
3. Invalid and cancelled input do not activate/save; injected original permission
   and storage errors remain failures.
4. Actual public reference resolver returns exact asset text and rejects an
   arbitrary traversal path. A hostile synthetic title is escaped in HTML/JSON.
5. Actual shipped interaction code keeps packets, labels and selected elements
   coherent through send/ACK, autoplay, partial tail, end, resize-of-window/reset
   and independent instances.

```sh
cd /workspace/visualize264-review
/workspace/.tools/node-v22.23.3-linux-x64/bin/node \
  --experimental-strip-types --test public-path-probe.test.mjs
```

The actual renderer/reference module and existing Zod/runtime exports are used.
Unrelated tool groups are inert; authorization/storage are explicit recording
stand-ins, and the interaction test uses a minimal DOM stand-in capturing the
selection callback. These are not claims of an independently repeated provider,
database, network authorization or browser layout test. No new DB or browser
matrix was started.

All 18 changed textual snapshots match the GitHub API Git-blob hashes;
`download-provenance.json` binds them. The two synthetic screenshots were not
downloaded. The committed browser summary reports one official engine case;
15 raw rectangle samples independently recompute to the stated maximum edge
error **0.0265655517578125 CSS px**, with the correct expected selected counts
(`geometry-recomputed.json`). This is a consistency check of submitted synthetic
evidence, not a new rendering run. The repository contains a human-readable
browser summary and geometry data, not a complete raw runner/DB execution log;
the author-reported 2/2 disposable-DB checks are therefore identified as author
evidence rather than an independent result.

The latest read-only remote receipt
[`39535212610`](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39535212610)
has the exact reviewed head. Server and deployment-contract jobs succeeded;
integration was still running at the saved observation, so full CI is **pending**,
not passed (`ci39535212610.json`). The parent remains responsible for its final
outcome and the actual integrated-commit release gates.

## Integration and restrictions

PR266 and PR268 share only the test fixture file `e2e/visualize/fixture-api.ts`:
retain PR266's per-resource delay mapping and PR268's `windowFixture` selection.
Their product source changes do not overlap. This review does not block PR266's
independent release.

Only `/workspace/visualize264-review/` was written, with a private symlink to
already installed dependencies. No install, full checkout, product edit, merge,
deployment, new credential, provider or production operation occurred. The
restricted production diagnostics directory, private production conversation,
HTML and screenshot were not accessed. Original-source investigation remains
pending authorization and is not needed to claim this narrowly supported new
path, but is needed before claiming the original blue-outline defect is repaired.
