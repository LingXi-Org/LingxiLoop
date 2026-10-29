# CaseCover integration handoff (#376)

Root owns `CasesPage.tsx` integration with external #375. This change does not
edit CasesPage, api.ts, content-editor, or global theme tokens.

Use the same `CaseCover` in list, detail, and saved editor preview:

```tsx
import { CaseCover, caseCoverIdentity, caseCoverPending } from './CaseCover'
import { useCaseCoverPolling } from './cover/useCaseCoverPolling'

<CaseCover
  cover={item.generatedCover}
  fallbackUrl={item.cover}
  title={item.title}
  scopeKey={`${companyId}:${userId}:${item.id}`}
  className="w-24 shrink-0 sm:w-32"
/>
```

`scopeKey` MUST include authenticated user and organization. The component keys
its resource lifetime by that scope, fingerprint, generation and immutable asset
URLs. A scope change destroys fetched documents, timers and frame listeners.
Server descriptors select draft for teacher and published for student; do not
select snapshots or construct generated URLs in the browser. Keep manual
PNG/JPEG/WebP/GIF upload restrictions and original `cover` field unchanged.

The current list has an `<a>` around the entire row. Split it into an outer flex
row, the existing text/title `<a className="min-w-0 flex-1 …">`, and CaseCover as
its sibling. Its interaction/retry buttons must never sit inside a link. Keep the
explicit title/read link so the cover interaction does not prevent opening an
article. In detail use `className="mb-6 mx-auto w-full max-w-xl"`; in editor
preview use the same component with the last saved descriptor and an explicit
"保存后自动生成封面" explanation when inputs have unsaved changes.

Teacher retry is `onRetry={...}` only when allowed by the selected descriptor.
The component passes the captured descriptor to that callback. In the callback,
check it still matches the current article target, use the page's existing
mutation/scope fence, then call `casesApi.retryCover(article)` and adopt only its
cover metadata. The API supplies `fingerprint`, `expectedGeneration`, snapshot
and a deterministic idempotency key. No row-version bump, optimistic fake ready
state or read-triggered job submission. Reader output contains no stack/params.

One page-level bounded polling subscription:

```tsx
const targets = article ? [article] : list.items
const pending = targets.some(item => caseCoverPending(item.generatedCover))
const targetsKey = targets.map(item => `${item.id}:${caseCoverIdentity(item.generatedCover)}`).join('|')
useCaseCoverPolling({
  scopeKey: `${companyId}:${userId}:${id ?? ''}:${search}:${category}:${targetsKey}`,
  pending,
  refresh: signal => id ? casesApi.detail(id, signal) : casesApi.list(search, category, signal),
  receive: fresh => {
    // Type-narrow detail/list; merge generatedCover ONLY for identical id + version.
    // Do not replace editing inputs or overwrite newer article/content state.
    // Retain operation/scope fences and return whether fresh targets remain pending.
    return freshTargets.some(item => caseCoverPending(item.generatedCover))
  },
})
```

The hook prevents adoption when scope changes even before effect cleanup. It
aborts on unmount/scope changes and stops after 24 reads, 120 seconds or three
consecutive read failures. Delays grow from 2 to 10 seconds. Re-entering the page
or a new content generation establishes a new bounded subscription. Existing
realtime events may replace polling later. Never re-fetch every card separately.

## Runtime boundary

Static SVG uses `<img>` with object-contain and a complete 400×320 / 5:4 box.
No inner HTML is injected into the application. Generated JSON is fetched from
the dedicated asset endpoint with the existing authenticated HTTP client only
on visible hover or explicit keyboard/touch activation. The global budget allows
two active cover renderers (each has one trusted outer and one model document) (oldest activation is disposed); hidden/offscreen/unmounted
covers dispose documents and abort in-flight requests. Reduced motion stays
static. Touch iframe pointer events stay disabled to preserve page scrolling;
the accessible toggle requests the renderer's meaningful central interaction.

A trusted outer opaque iframe creates a blob-backed opaque inner iframe; both
have exactly `sandbox="allow-scripts"`. The outer policy permits only blob child
frames, constraining inner self-navigation; the inner initial policy blocks all
network subresources and child frames. The server's hash-based script policy
remains in the inner head and further restricts scripts. The outer script escapes
all generated closing tags and never executes generated source in its own realm.
Both message boundaries check exact `event.source` and exact message shapes.
Opaque `null` origins confer no trust. Child status is not proof of safety or a
source of persisted SVG/assets. The trusted renderer owns theme, stable 5:4
geometry and upstream lifecycle. Ready timeout is 12 seconds; failure retains
static/original preview.

Native policy probes are required before claiming navigation isolation. They
measure local HTTP endpoint count for location, data, blob, nested-frame and
document.write escapes. They do not prove arbitrary-script CPU/memory limits or
all browser/protocol channels; production isolated capture remains server-owned.

Official references: [CSP3 frame-src pre-request checks](https://www.w3.org/TR/CSP3/#directive-frame-src),
[HTML blob policy containers](https://html.spec.whatwg.org/multipage/browsers.html#policy-containers).

## Verification

The old iframe/browser harness is archived in [Git history](https://github.com/LingXi-Org/LingxiLoop/tree/351e895a315bb46b9061c8628b20d9b9fa5ffa1e/e2e/case-cover). The current QuickJS boundary and its retained integration check are documented in [cover-vm/README.md](../cover-vm/README.md).
