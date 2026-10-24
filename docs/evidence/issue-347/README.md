# Group message admission after a confirmed IM send

Refs [#347](https://github.com/LingXi-Org/LingxiLoop/issues/347). The original
teacher group's identity, messages and runtime records were not available and
were not accessed. Its cause remains unknown. A normal newly created synthetic
teacher group already completed HTTP send → real WuKong callback → native run on
the baseline. This change fixes a separately reproduced reliability defect;
it does not claim the reported private conversation has been repaired.

## Reproduction and correction

Dropping the asynchronous notification after a real durable WuKong send left
the baseline with an accepted human message, zero ingress wakes and zero runs.
The test was written first: [baseline failure](callback-loss-red.log).

For ordinary human messages, the product now commits the validated send acceptance and its existing ingress
outbox wake in the same PostgreSQL transaction. Only a valid WuKong ACK or a
matching authoritative history reconciliation can reach this commit. A lost ACK
cannot create an optimistic wake or authorize another IM send. If enqueue fails,
acceptance stays pending; history reconciliation retries admission for the same
committed message.

The trusted acceptance records its own receipt, while its wake retains the same
`msg.notify:<WuKong message ID>` identity used by the ordinary signed callback.
Concurrent accepted retries and a later callback therefore converge on one wake
and native admission. The receipt fingerprint uses the existing canonical digest
and stable primitives, so PostgreSQL JSONB key ordering does not change it.
The existing Worker retry loop performs admission; the HTTP send does not wait
for model generation. No new protocol fields, database migration or permission
grant are introduced.

Questionnaire answers retain their existing durable submission lease and
`questionnaire:<nonce>` continuation wake. The generic path does not admit them
early or replenish their retry budget. The owning crash/recovery regressions
keep their original assertions.

Routing remains explicit: a human's valid member mentions target those Agents;
`@all` targets member Agents only. Otherwise a reply target, configured leader,
Nova/Forge preset or the existing default Agent is selected. A normal message
does not wake every Agent. Agent webhook echoes do not dispatch another turn.
Current product authorization and native policy still gate execution/delivery.

A second synthetic regression configured a departed Agent as the stale leader
while another Agent remained active. The old webhook resolver enqueued the
departed Agent, which cannot pass runtime admission. Both ingress and native
policy now use the same deterministic default resolver; ingress reads only the
intersection of current conversation/binding members and excludes departed
participants. [Before](departed-default-red.log), [after](departed-default.json).
The test deliberately retains the stale IM audience and proves the existing
frozen-audience guard still blocks delivery until membership is reconciled.
This demonstrates restored active-Agent admission, not a safe reply to an
unreconciled channel. Query-order instability is covered by a separate
[red regression](roster-order-red.log).

## Verification

- Real local PostgreSQL, Redis, WuKongIM and the published LingxiOS 3.8.3 Worker;
  deterministic in-process model responses, with no paid or production requests.
- Initial qualification: nine integration cases passed: callback-free HTTP CI coverage plus real IM
  normal/lost callbacks, another teacher's explicit mention, two humans with one
  Agent, explicit broadcast, enqueue rollback, lost ACK/history recovery and
  provider failure. They check concurrent replay, cross-tenant/nonmember denial,
  canonical body mentions, one human message and one run/reply per target.
- Official `@e2e-dev/web`: ordinary Composer send → default reply, explicit
  member mention → specified reply, browser reload → three durable human
  messages and three replies/wakes/runs. [Report](browser-summary.md),
  [screenshot](browser-reload.png).
- Initial server unit tests: [125/125](server-unit-summary.log); the added
  default-routing suite then passed 3/3. Server lint, server
  typecheck and E2E typecheck passed.

Repeat the isolated qualification:

```sh
node e2e/server/group-wake.mjs --browser
node e2e/server/group-wake.mjs --related-only
```

The runner creates its own disposable Compose project on loopback ports
18546/18549/18551/18552, uses synthetic credentials, disables embeddings and real
provider access, applies the formal product migrations, and removes only its own
containers afterward. The default IM image is the locally cached test image of
WuKong source `c7f663fa23a4ee2c6f7e08c68423f50f0f6e9c47`; supply
`E2E_WUKONG_IMAGE` to use another qualified local image. The callback host must
be local/private; `GROUP_WAKE_CALLBACK_HOST` can select Docker's host gateway.
Install the official browser with `npm run test:e2e:install` when needed.

The browser uses isolated test authentication and ordinary product components,
HTTP send, history decoding and run rendering. Fixture history polling replaces
workspace WebSocket notification only; it never creates a run or invents a reply.
This does not qualify production WebSockets, a real model provider, or the exact
production IM image. Historical accepted messages are not bulk replayed.

The existing IM configuration uses notification batches of one. The parser's
single-item limitation was noticed but was not used as an explanation of the
reported failure or changed in this patch.
