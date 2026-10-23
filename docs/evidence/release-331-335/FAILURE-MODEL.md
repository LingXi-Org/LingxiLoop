# Runtime and conversation release integration

Before product integration, qualify these failure boundaries:

- Protocol recovery, bounded content completion and joint content/scope review
  must come from one formally published, exactly pinned runtime package. Never
  install a private source patch as the production runtime.
- The product Worker explicitly opts into three additional content corrections;
  model protocol repair remains bounded to two and global call/token/cost/time
  caps remain unchanged. Untrusted request metadata cannot choose this allowance.
- Old behavior bindings and checkpoints cannot acquire a new runtime or allowance
  when resumed. Release preflight and the final fenced transition must account
  for nonterminal waiting, queued and expired leased work, not just live leases.
- Native schema and every product migration remain identical. Current startup
  must require exact formal package provenance; the separate reviewed runtime
  patch operation must not run historical migration or seed entrypoints.
- Real provider failures retain their categories. Protocol failures stay protocol
  execution failures; partial/blocked results retain useful body and truthful
  outcome with the authorized retry path. Never report a partial body complete.
- Combined content review preserves human boundaries, cancellation and native
  resource/side-effect checks while removing the redundant serial scope call.
  Trace labels consume only closed, allowlisted operation values from real calls.
- Native quote presentation must preserve existing quote selection/clear/send
  behavior together with incomplete-result notices and retry controls.
- Verify the exact target CI and immutable image before stopping any service;
  retain first deployed container/image identities, terminal native receipts and
  four-service/public health evidence. No original user task is retried by release.

Validation scope: formal-package version and schema checks, affected runtime
provider/recovery/projection integration, safe operation-trace mapping and the
owning quote/incomplete-answer UI regressions. Synthetic and development-provider
results establish exercised cases only, not a production completion-rate claim.
