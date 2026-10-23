# #326 production handoff (sole release owner only)

This branch neither merges nor deploys. Production validation belongs to task
`01a16484-bef1-7317-8f6e-da46a18450e9`, coordinated by the parent thread.
No original conversation/message/run IDs were supplied. Do not label the original
incident's root cause confirmed from the screenshot or these synthetic tests.

Use an already authorized non-sensitive test conversation and ordinary teaching
questions. Do not grant additional persistent roles/capabilities for testing.
Do not read unrelated conversations. Stop any denied action without changing path.

Minimal scoped evidence (keep real identifiers private; publish stable aliases):

- Deployed commit and immutable Web/Worker image identities, runtime version,
  native/product schema provenance and enabled public-text protocol.
- Endpoint hostname/path without query/userinfo, configured and actual model ID,
  configuration fingerprint; request/first-byte/idle/total timeout and attempt cap.
  Never API keys, headers, prompts, request/response bodies, screenshots or raw logs.
- Authorized tenant/conversation/user-message/run/work/attempt aliases, request
  version and fence, a bounded time window and state transitions. Preserve the
  relation between message, run, logical model call and per-call attempt.
- Allowlisted provider request ID/code, HTTP status, failure category, retryability,
  elapsed duration and stage (context, reservation, provider headers/body,
  auxiliary review/compaction, commit, terminal delivery, client SSE/history).
- Counts of model attempts/settlements, unique tool intent/receipt identities,
  terminal-feedback and IM acceptance identities, displayed terminal rows. Include
  absence of provider attempts for control-plane/client failures instead of
  inferring a provider outage from a generic terminal reason.

Probe sequence:

1. Verify a normal short Q&A using the actual deployed new model configuration.
2. In an isolated authorized fault fixture, inject one 503 then success, persistent
   503, quota rejection and timeout. Record the bounded attempts and precise class.
   Do not mutate live provider credentials or global configuration to cause faults.
3. After failure, send the same ordinary text with a fresh message ID; confirm a
   new run and successful answer. Replay the original accepted message ID and
   terminal feedback; confirm no new work, extra IM send or repeated tool receipt.
4. Refresh/reconnect and switch back to the conversation: each failed run has one
   visible terminal; two distinct user sends remain two sends/runs. Preserve
   cancellation and revoked-access behavior. A system terminal without an
   available run projection must remain visible.
5. If original IDs become available, use only that authorized bounded chain to
   compare actual errors/configuration to the synthetic failure; otherwise report
   original root cause and real-provider acceptance as pending.
