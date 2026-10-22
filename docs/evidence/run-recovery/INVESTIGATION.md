# Conversation run recovery

Baseline: main `df30def96c0f464660af87067a7177d6730cc163` (PR306 and PR307 included). This patch does not change release tooling, production, migrations, admission, tool execution, or credentials.

## Reported UI and owning chain

The current main tree contains no literal `连接任务失败`. Its matching status-check card is `HarnessDetails.tsx`, driven by `metadata.runConnection` (`checking`, `released`, `inaccessible`) and containing the exact `核对任务状态` button. The card and its diagnostic prose have been removed. A transient reconnect is silent; exhausted observation has a plain `重新连接` action. Session expiry, access denial and missing replies have separate concise text. The established real execution failure/retry and cancellation UI remain.

Sending uses the persisted outbox ID, `lingxiIm.sendStatus/send`, the product IM acceptance receipt, native event worker and `api.conversations.ingest(messageId=clientMsgNo)`. `receive.ts` then binds/notifies the existing native run. This patch leaves those admission/idempotency boundaries intact.

Observation uses `ChatTransport` → `harnessApi.subscribe/read/list/history` → authenticated `server/src/im/router.ts` → `productRunIdentity`, `readRunProjection`, native `streamRun` → `assistantRunResponse` → the actual assistant-stream decoder → canonical store reconciliation. Reconnection calls only read/stream operations. It never calls send, ingest, revise, continue, reconcile or delivery retry.

## Proven local defects and corrections

1. A prepared, authorized server projection was withheld until the native upstream emitted a non-heartbeat event. Send the prepared projection immediately; retain the subsequent native replay/fence handling.
2. Browser stream establishment and the first valid snapshot had no deadline. A 10-second first-snapshot deadline now aborts the actual fetch/body read and cleans its timer. Durable polling still detects a missing terminal SSE frame.
3. `Promise.all` discarded successful recent or anchored discovery when the other source failed. Pending history rows, including saved prose, were then dropped on recovery error. Discovery now settles independently; all terminal states hydrate through the read endpoint. Saved nonempty prose paints before optional recovery, without claiming that an old running row is still active.
4. After 60 seconds without authoritative confirmation, the old code only changed the card while polling/reconnecting forever. Observation now releases local running state and stops both loops. Explicit reconnection or a real network wake can start another bounded observation cycle. Permanent HTTP errors stop automatic retry and disable controls.
5. History and live preview have different freshness information: public run counters omit preview sequence. Cached pending IM must not overwrite an existing live run in the same/newer generation. Per-run observation generations also fence late history successes/failures against newer SSE, local release or refresh. Multi-run unresolved errors survive unrelated successful updates and pagination outside the recent-run window.

These are deterministic synthetic/local reproductions. No private production conversation was searched or read. Without the reported run ID and exact access authorization, the cause of that specific production occurrence remains unproven.

## Evidence and limitations

Tests were written before the corresponding implementation. The local delivery directory retains red/green logs for lost history body, a hung handshake, wrong 404 classification, first-paint blocking, and late history/SSE races. The official `@e2e-dev/web` suite supplies eight synthetic HTTP scenarios with the real decoder, transport, store and conversation UI, asserts zero mutation requests and captures screenshots. Server transport tests cover an idle upstream, replay, reset, terminal state and cancellation.

No database-backed integration, real provider execution, production access, merge, push or deployment is claimed. The final delivery report records exact check results and candidate commit. Web builds use a source copy under `D:/Temp` to isolate an unrelated user-home Yarn PnP manifest; installed published dependencies are reused without installing packages or changing npm configuration.

## GitHub blocker

The first duplicate-issue search (`gh issue list --repo LingXi-Org/LingxiLoop --state all --limit 100 --search '连接任务' --json number,title,url,state`) ran from the task-2 root and returned HTTP 401. `gh auth status` there, and later inside this repository, reported active `leecyang` invalid. `GH_TOKEN`, `GITHUB_TOKEN`, and `GH_CONFIG_DIR` are absent at process/user/machine scope. The visible Git credential helper comes from the system Git config (`manager`); no identity or helper was changed. Git clone succeeded but this does not prove the identity or ability to write issues. No retry of the denied issue query, identity switch, new credential, issue/PR creation, or push is claimed. The parent task has the issue/PR drafts and a local commit/patch for an already-authorized path to submit later.
