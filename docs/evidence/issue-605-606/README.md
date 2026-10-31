# Visualize recovery and numerical-consistency regressions

Base: production main `dade873ac04492b00c23a29a26c95fa3da5666fb`, formal SDK3.8.20,
native14/product61. This candidate is not merged or deployed.

## #605: resource recovery

The original Lenovo report has no failed-request status or network trace. Its
precise original cause remains unconfirmed. Source inspection found that an idle
public renderer GET spent its existing recovery attempt on the same public URL.
A stalled public route therefore could time out even while the page-authorized
resource endpoint was available.

The second existing read attempt now uses that endpoint, with the same page
capability, tenant/project scope, cancellation signal and SHA256 verification.
The15s initialization deadline,5s idle threshold and two-attempt bound remain
unchanged. A valid late first response can still win. HTTP401/403/429 and
Retry-After do not trigger this recovery. Invalid hashes are never cached.

The new unit regression failed before the change: at5250ms no authorized
recovery occurred. The fixed regression passes, alongside explicit rejection,
cancellation and corrupt-byte cases.

`browser.json` records an actual cloud Chromium run of the product host,
retained-page owner, opaque sandbox and pinned guest SDK, using a local synthetic
API. It covers a stalled public gen-ui.js request recovered through its authorized
page route, real ArrowRight input and state save, conversation close/reopen at
390px, refresh with state restoration, HTTP403 without fallback, and explicit
retry acquiring a new capability. This is not the Lenovo production browser or
a claim about its missing network trace.

Reproduce after installing exact lockfile dependencies:

```sh
npm run build:visualize-runtime
npm run dev -- --host 127.0.0.1 --port 5285
# In another terminal:
node scripts/check-visualize-reopen.mjs
```

## #606: content review is separate from storage verification

The existing semantic selector deliberately skipped every current activated
visualization. Native authoring delivery checked access, saved bytes and the
reference; it did not compare default calculations with adjacent prose. The
new unit regression first failed because such a candidate nominated no review.

A current authorized activation with an actual candidate reference now
nominates the existing native selective content checker. Its focused rubric
compares the same parameters, formulas, units, ratios, labels and explanation;
incomplete evidence cannot certify mathematics. The checker uses existing
native budget, durable scope reservation and candidate/hash deduplication.
Neither the SDK nor its seal/core runtime is patched. Storage-verifier evidence
now explicitly says `semanticValidation:false` and `browserValidation:false`.

`worker-consistency.json` records real PostgreSQL/Redis/product ACL/Worker tests
with a synthetic generator and checker. Matching values complete; contradictory
values retain partial status; malformed checker output remains inconclusive and
partial. Each scenario has one durable runtime.review record. The malformed
case uses the existing model adapter's three bounded requests, not three logical
reviews or an increased allowance. Existing native-v1/v2/v3 activation,
explanation binding, exact saved bytes, unauthorized read rejection and bounded
failure coverage remain present and pass.

`real-reviewer.json` records one actual SiliconFlow DeepSeek review inside the
same isolated product Worker, with synthetic generation and supplied test
measurements. It received the saved-source/readback, detected the chart/prose
contradiction, and left the result partial/inconclusive. One actual review
request was made. This proves the new review path catches this controlled
contradiction; it does not establish either original FlashAttention formula as
correct. No original private conversation, production artwork or credentials
were copied or changed. The synthetic fixture's9.25/20.3 values are supplied
test measurements, not an independently validated attention IO model.

## Executed validation

- Focused resource/policy units8/8.
- Web smoke plus affected GenUI/resource tests147/147.
- Server smoke plus policy tests159/159.
- Owning integration20/20 across content review, all three native bindings,
  authoring delivery and quality/readback. The final explicit storage-evidence
  assertion was additionally rerun3/3.
- Real-reviewer qualification1/1; cloud Chromium5 recorded scenarios.
- Web/server typechecks and lint passed; existing Web lint warnings remain.
  The production Web build passed with existing bundle-size warnings.

The actual generated teaching content's mathematical correctness and a Lenovo
production replay remain outside this evidence. Do not reinterpret successful
save, delivery or these controlled fixtures as general semantic acceptance.
