# baoyu-design v2.8.0 — issue 648

Upgrade from `c15e76ef5134228d2bb5da35652d30d7d6b8a34d` (v2.1.0) to
`016b39d7fdcc30bfacee31ea5541498ac53921c6` (v2.8.0). Delivery is a draft PR;
merging and production deployment are outside this task.

## Provenance and native behavior

The 59-file editor archive and complete 542-file distribution retain upstream
bytes. SHA-256, byte counts and Git blob SHA-1 were checked locally; all 542
path/blob/mode/size records also match GitHub's recursive tree for the pinned
commit. No host adaptation is applied to `upstream/` or `distribution/`.

Slides recovers 332 named factories (313 active, 19 removed video factories)
from the new compiler. Its provenance map records the new factory locations.
Native behavior retains Chinese copy, passive legacy-video serialization without
video tools, KaTeX, workspace/presentation bridge, explicit PDF confirmation,
lazy export libraries and built-in style. Design retains runtime URL, visible
mount, math and natural-height layout adaptations at the new bundle's hooks.

## Chinese UI and new-document themes

Design translates 2,224 upstream default messages plus visible labels/fallbacks
through an AST adaptation and native catalogs. Slides translates recovered UI,
accessibility labels, export explanations and new-template placeholders.
ICU arguments and branches, icons, keys, enums, saved user text, font names and
format abbreviations remain intact; debugging/protocol diagnostics are retained.
Two GPT-6.1 Terra workers implemented the editor copy in parallel.

Three original palettes use the upstream color/type design-system schema:
学术蓝 (`academic-blue`), 森林课堂 (`forest-classroom`), 深色演示
(`dark-presentation`). They are stored as ordinary `project/ds/*/tokens.json`
resources only during document creation. Existing documents are unchanged;
Slides keeps its existing default style. No remote fonts or new dependencies.
The existing Slides four-system quota is now occupied by the default plus these
three systems; replacing one uses the existing document tools.

## New upstream server routes

Both upstream servers contain the same new local hub, share, history and
design-system infrastructure. The table uses paths relative to the upstream
mounted editor where applicable. LingxiLoop continues to use its existing
`/artifact-editor/<kind>/<grant>/` router; it never starts upstream `server.mjs`.

| Method | New route | LingxiLoop handling |
| --- | --- | --- |
| GET, POST | `/__hub` | Local-process mount/unmount hub is not run. |
| GET, POST | `/s/:token` | Guest join/share links are not exposed. |
| GET, POST | `/__share` | LAN/link/reset/role/remove operations are not exposed. Project grants continue to own access. |
| GET | `/__share/me` | No share identity polling; no `__baoyuShare` boot global. |
| GET | `/__share/boot.js` | Upstream ShareHost boot injection is not used. |
| GET | `/__share/invite` | Invite UI is omitted. |
| GET | `/__share/ui.js` | Design build removes `share-ui.js`; recovered Slides never includes it. |
| GET, HEAD, POST | `/__share/archive` | Archive controls are omitted. |
| POST | `/__share/save` | Local-disk download interception is omitted; native `downloads.save` handles browser downloads. |
| GET | `__history`, `__history/` | No history boot global or history navigation. |
| GET, POST | `__history/notices` | No upstream conflict/history notices UI. |
| GET | `__history/:n/diff` | Version diff UI is omitted. |
| POST | `__history/:n/restore` | Version restore UI is omitted. |
| GET | `__history/notice/:id/diff` | Recovery diff UI is omitted. |
| POST | `__history/notice/:id/recover` | History recovery UI is omitted. |
| GET, POST | `__presence` | Design's transport returns null without `__baoyuShare`; Slides' native host bridge has no local presence transport. Existing native agent activity remains. |
| GET, HEAD | `v/:n/…` | Historical editor/project/listing/session/events/blob mirror has no entry point. Upstream rejects writes; Lingxi does not add the mirror. |
| GET | `v/:n/__comments…` | Historical comments are not exposed. |
| GET, HEAD | `__ds/:namespace/` | Design's filesystem design-system link is removed; ordinary theme controls remain. Slides has no such entry point. |
| GET, HEAD, POST | `__ds-sync/:namespace` | Design's filesystem sync component is removed, including its mount/focus fetch. |
| POST | `__comments/agent/requests` | Design does not advertise the optional `sendRequest` capability. Existing native comment-thread sends remain. Slides retains its native comments bridge. |

The hub also mounts `/design/:id/` and `/slides/:id/`; these namespaces are not
used by the native grant router. The historical root `v/:n` redirects to
`v/:n/` upstream; there is no corresponding native navigation.

Changes to existing routes are deliberately not ported:

- `__deck/publish` adds `over`, `merged`, `page`, history and author metadata.
  Lingxi retains its existing `files` wire format, atomic CAS and authorization.
  There is no separate merge endpoint.
- `__deck/session` adds roles; native access remains the grant's `canEdit`.
- `__deck/events` adds presence, replay and attribution; the hub also accepts a
  `baoyu-sse` WebSocket fallback. Native SSE and its existing event shape remain.
- Comments snapshots/mutations add upstream role, principal and ownership
  behavior. Native comment authorization and storage remain authoritative.
- Project/static/blob/assets routing gains upstream share-role enforcement;
  native grant/document authorization and asset routing are unchanged.

The generated Design program has regression coverage for the removed direct
request capability and design-system controls. The browser fixture loads a
real token file and opens Theme, exercising the formerly failing sync trigger.

## Validation

Windows, Node 22.22.2, installed Chrome via Python Playwright. Deterministic
browser fixtures use real built editor programs and in-memory API replies;
they do not prove production database, authentication or tenant integration.

Commands and final outcomes are recorded here after the final candidate build.
The initial route audit found two real gaps (direct agent requests and local
design-system sync). A new Design packaging assertion failed before the
capability removal and passed after it.

## Size comparison

[`sizes.json`](sizes.json) records exact byte counts for both editors. Baseline
is native v2.1.0 at LingxiLoop `3173bbb7`, rebuilt in an isolated checkout with
the same installed dependencies, Node and Brotli quality 11 as the candidate.
Initial JavaScript means script entries plus HTML modulepreloads; optional
runtime meta URLs do not count. Full browser JS/CSS includes lazy chunks and
optional runtime/Babel, excluding fonts, HTML, source maps, Node compiler and
compression sidecars. Sum raw file sizes and the corresponding `.br` sidecars
listed by each generated manifest; verify their lengths against `compressed`.
This is a payload comparison, not a loading-time benchmark.

## Parallel loading work

PR #647 (`claude/editor-instant-open`, `6a1f593f`) is pending separately. It owns
isolated Slides origins, preload routing/caching, and shared font URL resolution.
This branch changes neither artifact transport nor authorization. Overlapping
files need integration when #647 lands: provenance README, artifact-math tests,
and the recovered `export-pdf-capture.js`. Preserve #647's stylesheet-origin
font resolution while retaining the new recovered exports. Re-run the editor
checks and #647's export-font regression after rebasing.
