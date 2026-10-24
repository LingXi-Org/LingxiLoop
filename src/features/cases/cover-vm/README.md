# Case cover VM boundary

The pinned Hairline MIT kernel and a generated figure run inside QuickJS 0.32.0
WASM in a disposable Worker. No generated source is evaluated by Node, the
browser JavaScript engine, an iframe or the application DOM. The original
builder and validator remain syntax/style gates and do not confer isolation.

`program.ts` accepts only `{version:2,engine:'quickjs-wasm',kernel,figure}` JSON.
The persisted legacy field named `html` carries this data, not a document. Old
HTML is rejected; the owning contracts must use the new V2 rules fingerprint.
`guest-entry.ts` is bundled into `guest-source.ts` by `build-guest.mjs`; that
module exports text only. Both server and browser use the same text, kernel,
virtual clock and bridge. Rebuild the text after adapter changes. No guest
objects, functions, references, promises, exceptions or DOM handles cross into
host code: inputs are bounded JSON literals and outputs are primitive strings.
The host independently checks the entire output with `parseCoverFrame`.

`runtime.ts` fixes the binary SHA256 to
`105c3bed22d457e43e3d1c3c1c6959fda62a8fe06f0fc8a985303c3a2be72232`,
removes QuickJS's module loader, and registers no guest-callable host function.
The browser fetches only the fixed WASM build asset before running the guest.
Guest fetch/XHR/WebSocket/WebRTC/process/require/std/os are absent. Its synthetic
document only constructs permitted SVG nodes in VM memory. This is a capability
boundary, not a CSP claim or an OS sandbox.

Budgets: 8 MiB QuickJS heap, 256 KiB QuickJS stack, 64 MiB imported WASM memory,
500 ms shared across bootstrap/kernel/mount/first snapshot, 100 ms per later
event/tick, 10,000 interrupt callbacks per evaluation, 18,000 requests per VM,
1,024 nodes, 16 tree levels, 128 pending callbacks and 256 KiB output. Browser
owner terminates after 8 seconds starting or 1 second awaiting a reply; it keeps
one request in flight and a fixed number of coalesced event categories. The
server uses an 8 second Worker watchdog plus V8 limits of 32 MiB old heap, 8 MiB
young heap, 2 MiB stack. V8 limits do not include WASM memory; that has its own
maximum. Scope, request and sequence checks reject old/cross-scope output.
Unmount, inactive state, scope/source replacement and errors terminate workers.

`svg.ts` serializes only validated SVG attributes with a fixed palette. Browser
output is an SVG Blob displayed by an img; no generated markup enters the app
DOM. Pointer coordinates account for the image's contained 5:4 viewBox; focus,
visibility, reduced motion, touch and theme are explicit host controls. The
server samples mount/tick-zero geometry and exports a real static SVG. Body
snapshots stay in the generator input and provenance metadata, never in the
interactive program.

## WASM import inspection

Static binary parsing found 19 function imports and one memory import, all in
module `a`. Memory `a` declares min 256/max 32768 pages; our supplied memory caps
it at 1024. Reading the published Emscripten browser loader maps the functions:
`b` assert, `c` fd_write, `d/o` unsupported descriptor operations, `e/f` environment
metadata, `g/h` module-normalize/load glue, `i` interrupt, `j` runtime timeout,
`k` memory growth, `l` runtime liveness, `m/n/p` clock/time-zone, `q` abort, `r`
keepalive glue, `s` host-call dispatch and `t` host-reference disposal. The last
FFI hooks are package machinery; this adapter never registers guest host-call
handles and disables the module loader. The loader contains trusted asset
fetch fallback code; supplied verified wasmBinary avoids that path. These
facts do not prove absence of engine defects or establish a full hostile-code
security qualification.

## Verification status

Pure guest/data/session and generator-stub tests: 30 passed. Focused TypeScript
and browser Worker static bundling passed using the exact already audited
package files (no package lifecycle scripts). No actual VM was run during these
checks. `verify-package.mjs`'s five primitive checks were executed once by the
parent and are not rerun here. `verify-runtime.mjs` is a new, separately reviewed
qualification action, not an automatically executed test. It exercises the two
pinned public examples and literal hostile fixtures under a bounded child.
The parent's first actual runtime attempt exposed the primitive-string length
API mismatch, now fixed. The next produced a real riffle frame (27,423 SVG bytes,
23,529 root JSON characters) with changed pointer geometry, then exposed terrain's
missing VM-local after() operation, now covered by the guest. A later attempt
hit the 100 ms mount deadline on riffle under contention. Initialization now has
one shared 500 ms allowance; step, heap, WASM and watchdog ceilings stay fixed.
The pinned kernel is 27,905 bytes; riffle 7,399 bytes/123 SVG nodes; terrain 4,444
bytes/258 nodes. Counts derive from the original loops, not a reduced fixture.
Full fixed-suite success, renderer worker startup, browser interaction, model
output, packaging and integrated ACL/task fencing still require their own results.
Resource limits and pure tests alone do not make those claims.
