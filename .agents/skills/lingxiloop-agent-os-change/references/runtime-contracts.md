# Agent OS Runtime Contracts

Apply the sections reached by the change. Verify current code before relying on names in this guide.

## Ownership map

- `server/src/im/`: WuKong webhook validation, routing, reconciliation, and payload contracts.
- `server/src/agent-os/`: control plane, durable queue, session/model loop, runtime, Host Bridge adapter, scheduling, memory, and watchdog.
- `server/agent-os/kernel_runner.py`: isolated persistent IPython kernel process.
- `server/src/agents/`: typed learning-domain actions, identity, coordination, observability, and LLM ledger.
- `server/src/canvas/`: shared Canvas persistence and orchestration.
- `src/lib/im/` and message stores: browser-side authoritative chat synchronization and preview reconciliation.

## Durable work and sessions

- Persist a validated webhook receipt and its `AgentWorkItem` atomically so a failed dispatch can retry without loss or duplication.
- Use a monotonically increasing work fence plus opaque lease token. Every worker mutation that can outlive a claim must prove the current lease; cancellation must block new actionable side effects.
- Serialize a session by `{companyId, agentId, channelId, threadRootClientMsgNo?}` while allowing unrelated sessions to run concurrently.
- Renew or release the work lease and session lease coherently. Treat expiry, stop, preemption, and watchdog recovery as competing terminal transitions.
- Persist session history with optimistic revision checks. Never let a stale worker overwrite a newer session.
- Keep `runId` equal to the durable work id. Retried work must reuse externally visible identities.

## Model and IPython

- `MODEL_TOOLS` contains only `IPYTHON_TOOL`, with strict arguments containing exactly non-empty `code`.
- The host owns history and provider conversion. Provider threads or alternate provider registries are not authoritative.
- Keep kernel state isolated per Agent OS session. Durable knowledge belongs in Agent Home or typed `loop.*` services, not accidental Python globals alone.
- Redact or fold raw code and internal output. User-visible activity must not reveal secrets, hidden prompt content, or unrestricted Python details.
- Knowledge evidence is turn-local, untrusted data. Preserve marker-based citations and do not freeze retrieved excerpts into durable prompt context.

## Host Actions and approvals

- Identify an action by `{runId, cellId, callIndex}` and a deterministic idempotency key. Sink identities must collapse a replay after a post-side-effect crash.
- Enforce tenant, agent, work, and resource ownership in the control plane even when the typed SDK already validates arguments.
- Persist approval-required actions before surfacing approval. Resume only that action and inject its synthetic result; never replay the originating cell.
- Execute denial at the final operation boundary. Prompts and schemas are guidance, not authorization.

## Events and messaging

- Keep per-run event sequence ordered. Distinguish internal events from learner-visible events.
- Model deltas and activity are ephemeral previews. The durable final `LingxiMessageV1` sent through WuKongIM wins reconciliation.
- Emit exactly one durable final response per completed logical work item. Recovery must not duplicate it.
- Stop aborts the current request/cell; steer becomes the next highest-priority input and does not roll back completed side effects.
- Agent-authored messages do not fan out without an explicit mention or typed handoff.

## Required evidence by seam

- Tool or parsing: `agent-os-tool` unit coverage and architecture guard.
- Runtime/session/model conversion: focused runtime/model-driver tests plus stale revision and retry cases.
- Queue/control plane: concurrency and `agent-os-reliability` integration coverage for claim, fence, cancellation, preemption, and recovery.
- IM routing/webhook: duplicate delivery, transactional receipt, mention/reply routing, ordering, and final-message integration coverage.
- Host Bridge/Canvas: idempotent sink, tenant/resource checks, approval resume, revision conflict, and isolated-execution integration coverage.
- LLM call path: tracked-client or explicit streaming ledger accounting plus the ledger guard.
