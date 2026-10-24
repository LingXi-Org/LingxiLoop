# Case code blocks (#375)

Baseline: `2686f475eac075bc9033f13714d5d6bbfa5078eb`. All articles and identities in this evidence are synthetic. No production reads/writes or model calls were used.

## Reproduced causes

1. BlockNote 0.56.0's Markdown/HTML paste retains fence aliases and unknown language names, but its language select requires a supported canonical ID and throws otherwise. Our existing normalization ran only during legacy initialization. The mixed Python/JSON/text/js/unknown clipboard sample left the case body empty on the baseline.
2. Its VS Code paste handler interpolates `text/plain` into HTML. The browser turned `<em>literal</em> &lt; &amp;` into `literal < &` and lost the code block. The adapter now passes literal source through the official block serializer and selection-aware paste API.
3. ReactMarkdown adds a formatter LF to the code element; importing that HTML as native blocks added a newline to the code's actual content. The import and case source reader remove exactly that LF, retaining intentional blank lines.
4. Case Markdown fallback and native blocks had no visible code-copy control. Cases now reuse the existing source highlighter/copy component; native blocks extend the upstream renderer with a copy button. Highlighted source preserves real newline text nodes and uses the dark token colors.

The installed upstream code is `@blocknote/core` / `@blocknote/code-block` 0.56.0, gitHead `37614ab348dcc7faa830a9a88437b37197a2162d`: `packages/core/src/blocks/Code/helpers/{parse/parsePreCode,render/createCodeBlock}.ts`, `api/clipboard/fromClipboard/handleVSCodePaste.ts`, and `editor/managers/ExportManager.ts`. Public APIs are reused; installed packages are not patched, and dependency locks are unchanged.

## Change boundary

- Shared native code schema, VS Code clipboard adapter, legacy Markdown import, and scoped code controls.
- `CasesPage.tsx` changes only its Markdown `pre` renderer. Existing ReactMarkdown/GFM article semantics and container remain.
- The existing Memos source renderer gains a named export, preserved text newlines and dark token colors. Mermaid dispatch is unchanged; case Mermaid fences remain code.
- No cases API/contracts, migrations, CaseCover, permissions, runtime, model settings, CI selectors or default test lists changed.

## Verification

See [checks.json](checks.json) for selected runner results, failures and source hashes.

- Four focused unit tests pass: language/import boundary, VS Code literal serialization, legacy trailing blanks/unclosed fence, and escaped Markdown code rendering.
- Three new official `@e2e-dev/web` tests pass with real HTTP API + isolated PostgreSQL: create/preview/publish/reload/edit/publish/read; legacy Markdown and old native JSON aliases/unknown languages; VS Code clipboard.
- The browser tests verify exact code text, tabs/blank lines/trailing spaces, Python/JSON/text, aliases/unknown languages, unclosed fences, HTML-like source, inline code, links/lists/quotes/tables, wide lines on mobile, and light/dark presentation. Actual browser clipboard write succeeds; a subsequent injected clipboard failure/success checks recovery and the exact copied argument without granting persistent clipboard permissions.
- Two existing owning browser regressions pass: teacher cover/body image authoring and publication; native blocks/tables/math/diagram/undo/reopen.
- Web typecheck/build, repository lint and focused lint pass. Build has existing CSS/chunk-size warnings.
- The new E2E file and helper pass focused TypeScript checking. Full `test:e2e:typecheck` is **not green**: unchanged `e2e/react-delivery/recovery.e2e.ts` JsonValue errors and harness path-alias errors remain outside this issue. No claim of full-suite success.

The first local engine setup used an incorrect CDP option/resolver shape and executed no application tests. The baseline application run then failed both new probes. The first fix passed both; the added legacy check caught the extra LF. A strict horizontal-scroll assertion was corrected to allow the issue's permitted wrapping while retaining whitespace and viewport bounds. Pixel review also caught copy feedback shrinking the code area on mobile; the final layout assertion and screenshots cover that correction. These attempts are retained in the local reports and summarized in checks.json.

## Reproduction and limits

Use the isolated case services in [the existing guide](../../../e2e/cases/README.md), with `e2e.cases.config.ts`. The new file is included by its existing glob. With the fixture running, select only `e2e/cases/code-blocks.e2e.ts` through the official `e2e run` CLI. Unit command:

```sh
node --import tsx --test src/features/content-editor/code-block.test.ts src/features/cases/CaseCodeBlock.test.tsx
```

This cloud environment used installed Chromium through the official engine's public `connect.cdpEndpoint: async () => localEndpoint` adapter, Node 24.19.0, and the existing synthetic fixture. No Playwright import was added. Browser assertions are Chromium-only; other engines and production acceptance are unverified. The short local run durations are test execution measurements, not a user-performance benchmark.

The sole integrator owns merge and production rollout. Rollback is the product-code revert; there is no schema/data migration or production configuration change.

## Screenshots

- [Baseline mixed-language paste](before-paste.png)
- [Fixed light preview](after-preview-light.png)
- [Fixed mobile dark reading](after-mobile-dark.png)
