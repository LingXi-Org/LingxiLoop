# Visualize in LingxiLoop Web (#193)

The replacement for retired OpenUI uses ZCode `0a1fc56d279fd1001f78387bd81aec1c26767411`. LingxiLoop retains its chat shell, published LingxiOS runtime, durable IM, authorization and shared model ledger. This describes implemented wiring and required verification, not a claim that all acceptance gates have passed.

The complete 24-file skill is unchanged in [`third_party/zcode/skills/visualize`](../third_party/zcode/skills/visualize). The directory-external Tweak runtime, source archive, Apache-2.0 notice, vendor licenses and file hashes are described in the [provenance README](../third_party/zcode/README.md). All host adaptation is outside the skill directory. See also the [upstream architecture audit](../third_party/zcode/ARCHITECTURE-REVIEW.md) and [frontend port review](evidence/issue-193/FRONTEND-PORT-REVIEW.md).

## Generate, save and reference

`server/src/agent-runtime/visualize-skill.ts` registers the original SKILL.md as a published LingxiOS `SkillDefinition`. The product supplies `visualize.read_reference`, `visualize.save`, `visualize.read` and `visualize.export` through its native tool registry. `skills.load` loads the complete original body; the reference tool reads an explicit skill-relative allowlist. No shell or arbitrary file-read capability is exposed. Product context supplies the authorized output directory and adaptation instructions; internal/canvas work does not acquire this chat capability.

The model saves literal HTML fragments and reads them back. Inline save/hosting accepts at most 5,000,000 UTF-8 bytes. The server checks current conversation authorization, principal/run/agent binding, author ownership and a lowercase hyphenated filename. The output directory derives from company and conversation under `AGENT_OS_HOMES_ROOT/visualize` (using the existing homes default when unset). Files are executor mirrors; PostgreSQL `im_visualize_documents` owns source HTML, hash and version. A model reference never grants arbitrary filesystem access.

Final assistant text uses the actual returned path:

```text
::visualize{"path":"/authorized/output/chart.html","mode":"wide"}
```

The upstream parser also accepts its Unicode and key=value forms. Code examples remain inert, incomplete/streaming messages do not mount a guest, and completed references retain their original offsets. Optional `wide` is preserved; at this pinned commit normal/wide cards both fill the conversation's content width. Citation spans cannot intersect the directive. `VisualizeText` inserts the upstream message renderer into the existing assistant-ui surface while ordinary text uses the current Markdown component.

Page creation validates the delivered assistant message, matching reference, agent and run. The server issues random page ID/capability values and stores the capability hash with company, project, conversation, user, source message, document version, instance key and expiry. Rewriting a document invalidates older page versions; replacement of an instance revokes its predecessor. There is no conversion to OpenUI DSL or legacy message adapter.

## Web host and presentation

The port retains upstream card, Tweak panel, Dialog/Button/Textarea, parser, Tweak registry and retained-page manager. Import paths, product scope and host injection differ; the source review records these changes.

`web/document.ts` builds an opaque-origin iframe with `sandbox="allow-scripts"`. Product credentials and authenticated page capabilities stay outside the guest. Authorized fixed resources are hash-checked and served no-store. `scripts/build-visualize-runtime.mjs` bundles unchanged desktop `genUi.ts`, shared protocol and Tweak into `server/assets/visualize-runtime/gen-ui.js` and records source/output hashes.

Assembly preserves CSS/initial state/bridge before author scripts, and the full `visualize.html` inner kit after the fragment. Calendar is inserted when used. Fixed vendor scripts are replaced with bundled source; CSP constrains other resources and denies connections, nested frames, objects, forms and base-URL changes. D3 remains on demand. The Web host uses `Element.moveBefore` and a popover to retain the same iframe across inline/expanded anchors. Browser support for this retained-move mechanism is a real compatibility requirement.

The inline toolbar is inset at the top right of a rounded, clipped card (#213/#217). The expanded toolbar and Dialog geometry remain, including focus return, Escape, backdrop and parameter panel below content. Owner state supplies grouped sliders/colors/toggles/selects, reset, original preview and submission. Carousel behavior comes from the unchanged inner kit: variants remain in the DOM and toggle `hidden`, preserving each variant's local inputs. After full guest eviction, only authored widgetState is durable; arbitrary DOM/JS state is not automatically restored.

Theme tokens are scoped under `.zcode-visualize` so the chat shell stays LingxiLoop's. Root light/dark changes travel through the original HostContext mechanism. The extracted host CSS, fonts, sizes and portal tokens need independent comparison against complete upstream styles. No separate theme selector or export button is added.

Copy image currently uses a private bootstrap channel, `html-to-image` and the browser Clipboard API. This is a necessary implementation difference from Electron native `capturePage`; exact image fidelity is not established by reusing the card. Crop, DPR, fonts, canvas/SVG and clipboard permission behavior need dedicated evidence. The bootstrap precedes author code and captures a private port/native event listeners; the page receives no generic capture or tool endpoint.

## State, follow-up and authorization

The public guest API remains `window.zcode.widgetState`, `setWidgetState`, `sendFollowUpMessage` and `openExternal({href})`. Widget state is an upstream-validated replacement snapshot `{modelContent, privateContent}` with a 16KiB JSON bound. PostgreSQL `im_visualize_states` isolates company/conversation/path/user rows and retains up to 100 paths per personal conversation scope. SQL selects only modelContent; `visualize-state-context.ts` uses the upstream builder for the path-sorted 100-entry/64KiB escaped untrusted context. No privateContent enters it. The Web host uses state revisions, scoped BroadcastChannel invalidation, authorized reads and focus/online/10-second visible-page refresh. Concurrent-tab/late-read/save ordering remains an execution gate.

State saves do not start an Agent turn. Follow-up waits for saves, checks the active visible page and session binding, and requires a trusted gesture or the editable host confirmation dialog. The server mints expiring, one-use gesture tokens for live pages and consumes them transactionally. A guest boolean or fabricated public RPC frame is not a trusted gesture. Product/session/page credentials are never placed in the guest.

Follow-up uses the existing durable `acceptUserMessage` path and shared runtime/ledger. An idempotency key yields a stable client nonce and acceptance record; uncertain delivery is reconciled rather than resent blindly. Agent targeting derives from persisted document provenance. External open accepts HTTP(S), validates page and gesture, and runs in the viewing browser; it is not a remote command or model request.

Routes under `/api/im/channels/:id/visualize` check conversation permission, current human membership, teacher-room access and requested-project matching. Page methods additionally enforce company/user/project, source version, token hash, revocation and expiry. Resources/state/follow-up/external opening each revalidate their boundary. Generic IM ingress rejects forged Visualize follow-up metadata; signed callback checks remain in their existing owners.

The retained-page manager keeps upstream limits of 30 tasks/64 active pages and five-minute hidden-page suspension. Visible/busy pages are not eviction candidates. The Web hook now clears owners on authentication/company/workspace changes, releases service-cache entries with owners and listens for task removal signaled by authorization/not-found refresh failures. These integrations, pending teardown and deleted conversations still require integrated tests. The server's additional 64-page per-company/user limit is distinct from the browser's window-level capacity.

## Export and retained historical data

When explicitly requested, `visualize.export` reads the authorized document and invokes original `render.py` with temporary input/output paths, cancellation, timeout and `PYTHONDONTWRITEBYTECODE=1`. The resulting standalone HTML is delivered through LingxiOS `createArtifact`. The unchanged exporter embeds vendor scripts; generated content with host-only follow-up/openExternal calls must follow the upstream export workflow. A canned export alone does not establish real-model delivery.

Standalone export has a separate maximum of 1,000,000 input-fragment bytes, enforced by the unchanged upstream `render.py` and checked by the product adapter. Larger fragments that are valid for inline hosting must be simplified before export, as the tool description explains. This limit applies to the input fragment, not the final HTML containing embedded assets; it is not raised to the inline 5 MB limit.

Additive `0046_visualize.sql` creates document, personal state, page and gesture tables. Existing `im_ui_*` rows remain intact; `0033_interactive_ui.sql` is unchanged. No old rows are converted or deleted. This source change does not authorize production deployment or establish that 0046 is applied anywhere. Historical reports remain in [`artifacts/interactive-ui`](../artifacts/interactive-ui); the [OpenUI ADR](adr/issue-111-openui-m0.md) remains a superseded historical record.

## Repeatable checks and evidence boundaries

From the repository root:

```sh
npm run verify:visualize
npm run build:visualize-runtime
npm run lint
npm run typecheck
npm run test
npm run build
npm run server:typecheck
npm run server:build
npm run test:e2e:typecheck
```

The verifier checks all 24 skill files, fixed Git tree `87f38506cdda363267e0a73bfb2f20b4632134e1`, SHA-256/Git blob identities, out-of-directory Tweak and vendor licenses. Use `python3 -B` for direct exporter runs so the skill remains free of generated bytecode.

Only with `INTEGRATION_DATABASE_URL` pointing to a dedicated disposable test database and test Redis configured:

```sh
npm run test:integration -- \
  --file visualize.test.ts \
  --file visualize-runtime.test.ts \
  --file visualize-generation.test.ts
```

The integration runner truncates test data. An unset database prints a skip and can exit zero; that is not a pass. `visualize-generation.test.ts` uses a scripted provider with the real published runtime/tools/artifact APIs; it is not real-model E2E.

The official browser entry is:

```sh
PYTHONDONTWRITEBYTECODE=1 E2E_TELEMETRY_DISABLED=1 \
  E2E_VISUALIZE_OUTPUT=artifacts/visualize/browser \
  npx e2e run --config e2e.visualize.config.ts
```

The port-5193 fixture uses official `@e2e-dev/web`, not a direct Playwright runner. Its original-source/product-source entries share a Web host adaptation, limiting the claim a pixel match can support. Compare screenshot pairs with `python3 -B e2e/visualize/compare.py <pairs.json> --output <diff-directory>`; preserve both images, fixture/font/theme hashes, viewport/DPR and difference report.

Current gates and execution evidence live in [issue #193 acceptance](evidence/issue-193/ACCEPTANCE.md) and `artifacts/visualize/`. Missing/skipped/failed/mocked cases do not establish real-model behavior, native Electron equivalence or production readiness. The real-model ask→generate→display→adjust→continue sequence remains a separate acceptance item. Deterministic fixtures and provider health probes do not establish that it passed; the release record states its actual status and any explicitly accepted release limitation.
