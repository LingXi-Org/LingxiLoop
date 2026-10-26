# #515: protocol correction and v3 draft projection

The product regression reproduced the reported B shape against the **formally
published, locked LingxiOS 3.8.12**: two unsealed failed append attempts followed
by one committed answer. Before the change, full failed text appeared as
commentary in the delivery projection and activity history. The same native
reader now supplies the effective answer; failed/replaced/pending replacement
sources contribute only a fixed lifecycle summary, with their original ID,
order and revision. Native events and model accounting are not changed.

The change is limited to v3 segments. Genuine commentary, valid append across
tools, the original answer during a provisional replacement, incomplete current
answers, and legacy v1/v2 behavior remain covered. There is no text comparison,
operation rewriting, history migration, permission change or dependency change.
Already persisted old IM payloads are not rewritten.

## Evidence

- [Projection results](projection.tap): 12/12 passing, zero skips. Includes
  synthetic attempts/source IDs/final body, final delivery projection,
  message-first hydration, activity pagination, duplicate replay, explicit
  replacement, cancellation and the actual assistant transport encoder/decoder.
- The two new assertions failed on the unchanged product implementation: old
  draft sentinel leaked into final content; provisional replacement contained
  full draft text. They pass after the projection change.
- `npm run server:typecheck` passed; focused Biome lint and `git diff --check`
  passed. No browser test was run, per the user's instruction.
- Ingress/runtime/delivery trace: `runtimeModelConfiguration` selects native
  public_answer for the named DeepSeek profile; `delivery.ts` checks current
  request, frozen audience and scoped run identity before `projection.committed`
  and the existing nonce-bound IM delivery. Those checks are unchanged.

Reproduce the three test files using Node's `--import tsx --test
--test-force-exit --test-reporter=tap`, with the synthetic environment defaults
from `scripts/run-tests.mjs`: `answer-segments-projection.test.ts`,
`answer-revision-projection.test.ts`, `repair-public-projection.test.ts` under
`server/src/__tests__`. No live provider or database is used by these fixtures.

## Upstream boundary and release handoff

Read #515 and comments, #406/#341 and comments, OS PR65, Loop PR420 and PR491.
The previous explicit correction replacement contract is retained. A separate
source branch `LingXi-Org/LingxiOS:fix/515-protocol-completion` fixes a reproduced
diagnostic boundary (truncated public_answer arguments classified as tool
identity failure before the public parser runs) and makes terminal versus
intermediate correction guidance explicit. It retains strict schema/identity
validation, bounded corrections, effect authorization and ledger entries.

The A shape is still **not attributed to a proven production root cause**.
`outcome:null` legally continues a typed intermediate response; a terminal
outcome ends it. Synthetic upstream cases check failed protocol → terminal
correction and failed protocol → intermediate answer → real tool → null terminal
answer. This does not prove the actual historical field, deployed runtime, or
that a natural-language model will always follow the completion guidance.

Only de-identified issue evidence was available: no original restricted run IDs,
wire payloads or verified runtime/deployment identity were supplied, and this
environment exposes no LingxiLoop production reader. No production query,
message, retry, credential mutation, merge, package publication or deployment
was performed. Keep #515 open for actual sample/version attribution.

The parent hands PR/SHA to the sole #514 release coordinator. This product
projection can ship independently with its exact CI; adoption of upstream code
requires a normally published runtime and coordinator-owned exact pins/locks,
coordinated with #491's 3.8.13 integration. No lock or version was changed here.
