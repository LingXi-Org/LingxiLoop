# Actual demo screenshot comparison

Captured in cloud Chromium 154 at 1440×1000 through official `@e2e-dev/web` 0.12.0 / `e2e` 0.17.0 on 2026-10-21. All published images were opened and inspected as pixels. No private product conversations or production HTML were accessed.

| Candidate | Actual demo / provenance | License and result |
| --- | --- | --- |
| Langfuse | https://cloud.langfuse.com/project/clkpwwm0m000gmm094odg11gi/traces/2d6b96f2-0a4d-4366-99a5-1ad558c66e99 (official public example linked from https://langfuse.com/docs/observability/features/url) | Recommended: MIT non-ee core, pinned 4a8541413b2b2cda7f368215f1c26fc62bfb4bc5. Neutral surfaces, fine rules, short rows, restrained icons, legible light/dark. A full backend is unsuitable for embedding; adapt only MIT row metrics/bar presentation. |
| Jaeger UI | https://jaeger.demo.jaegertracing.io/trace/61534829fe04ee518d72e547063e236b (public demo via https://www.jaegertracing.io/demo/) | Apache-2.0. Real light/dark toggle and working root collapse. Strong timeline hierarchy but dense operator toolbar, many colors and service labels; less suited to a small conversational disclosure. |
| AgentPrism | https://agent-prism.evilmartians.io | MIT, inspected source 4fd371b5e4f25acd04278e94a0d4b21e543eb42c. Working expand/collapse. Many type badges and wrapped long names; narrow timeline tracks. The public landing demo does NOT change with `.dark`, so the dark-named captures record that limitation, not a working dark theme. |
| react-waterfall-timeline | Official source e8f043ea415570fb99d9effdddcafffcc5f4a032, rendered locally at http://127.0.0.1:5195 with official Basic/Mini story inputs and unchanged CSS | MIT. Thin/mini mode is compact, but no hierarchical child tree or built-in dark theme. Dark-named captures set host dark color scheme/background and demonstrate the still-white component. This is a source-run demo, not the unavailable GitHub Pages URL (403). |

Langfuse's public Tree and Timeline views have different collapse behavior: clicking the Tree toolbar's collapse command does not collapse the dense Timeline. We do not label those unchanged Timeline captures as collapsed. Local branch folding is an addition and is verified separately in the four product renderer tests. Jaeger and AgentPrism expanded/collapsed states provide the candidate collapse comparison.

## Functional comparison and local additions

The adapted Langfuse primitive handles duration/cost label placement without overflowing the track. LingxiLoop supplies keyboard-operable tree folding, safe selected I/O details, live/terminal clock behavior, slowest measured call marker, nullable timing/metrics, actual product data mapping, semantic dark-mode colors, reduced-motion transitions and the RunActivity placement. No zoom/pan, full observability platform, prompt/raw/reasoning panels, or affectUI visual assets are included. This is not a claim of unverified complete parity.

## Repeatability

The capture scripts are in `../scripts`. Copy a chosen capture script into `e2e/web/`, then run through `npm run test:e2e:web -- <script> --output .e2e/<name>` with `E2E_BASE_URL` and `E2E_CDP_URL` pointing at a dedicated browser. Public demo IDs/data can expire; use Jaeger's public read API `/api/traces?service=frontend&lookback=1h&limit=1` to discover a current trace. Do not generate transactions or sign in.

For the source-run waterfall demo: clone the pinned upstream commit under `/tmp`, copy `src` to the local demo directory as `waterfall`, use `waterfall-local-demo.tsx` as the wrapper, reuse installed React/Vite, and set Vite `esbuild.jsx='automatic'`. The initial missing automatic JSX runtime produced an empty page; it was fixed, rerun, and the empty screenshot is excluded. The wrapper changes only hosting controls, not upstream component source or CSS.

The initial browser certificate failure was the environment's public HTTPS proxy CA; the dedicated browser was restarted with the environment's public-site certificate override. No authenticated/private destination or credential transfer was involved. Earlier exploratory locator failures are not counted as successful functional coverage.
