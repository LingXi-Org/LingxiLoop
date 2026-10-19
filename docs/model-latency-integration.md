# Pending integration gate for issues 196 / 197

This branch deliberately keeps the exact published runtime 3.5.3 until the
upstream public API change is released. The auxiliary HTTP regression is red
on that version. It must pass before this draft becomes a release candidate.

After the upstream PR is reviewed, merged and published by the release owner:

1. Pin the actual published version in package.json and package-lock.json;
   verify its public WorkerOptions include `reasoningEffort: 'low'`,
   `compactionReasoningEffort` and `auxiliaryStreaming`. Do not use a source
   path import, local tarball, vendor copy or adapter.
2. In the existing worker model configuration, opt GLM-5.3-Flash on SiliconFlow
   into `reasoningEffort: 'low'`, `compactionReasoningEffort: 'low'` and
   `auxiliaryStreaming: true`. Keep `maxThinkingTokens: 0`, request/first-byte/
   idle budgets and recovery limits. Other provider/model defaults stay intact.
3. Enable the same public options in runtime-auxiliary-latency.test.ts, assert
   the captured HTTP parameters, and capture a candidate artifact. Require
   both initial and subsequent turns to succeed with settled ledger rows,
   durable delivery and no leaked reasoning. Run the owning model fault,
   deadline/cancellation and tool-recovery integrations plus server checks.
4. Repeat ordinary/streaming/JSON/tool-continuation probes only within the
   approved small synthetic budget. Record credential/network equivalence
   limits explicitly; a different execution path is not production validation.
5. Keep the product PR behind those gates. The release owner coordinates with
   the preceding visualize release, verifies actual A/B Worker versions and
   examines fresh sanitized outcome/latency observations after rollout.

No migration is proposed. The development branch incorporates main after
visualize migration 0046; any later schema work must reserve 0047 and recheck
main first. The existing isolation durability observation is outside this work.

Remaining limits: explicit low is a provider parameter, not a latency SLO.
Streaming avoids treating generation completion as first byte when the server
sends progress; it cannot make a silent provider send data. Caller cancellation
can still conservatively settle an in-flight call at reserved usage through
the existing runtime cancellation boundary. Do not claim exact usage recovery
for that case.
