# Initial fresh-color readiness before append

Failure model recorded before changing the test.

The combined run at product source `5d0456373ef33d88d45955d1811a523796574425`
passed 34/35 cases. The Chinese color case sampled the same foreground color
before and after append, while recording four intermediate colors, retained
node identity, zero stable-block mutations, two fresh tail tokens, and one
caret. Original receipt: `/tmp/ui-release-combination-after-space.log`;
artifacts: `artifacts/ui-release-combination-after-space` in the combined tree.

The current test at PR220 `1187670008afe66dd37ec31f579c5d001186c6f6`
waits only for `textContent` before sampling the third token. Text arrival does
not establish that the whole-part fresh registry and CSS transition have
reached the fresh blue color. Appending during the initial foreground-to-blue
transition can immediately reverse it to foreground; therefore equal initial
and final colors do not demonstrate a production animation failure.

The test must first observe the same connected token, the exact initial fresh
list `["丙", "丁"]`, and its computed color equal to the existing caret's
computed background color. Both use the official blue token; caret opacity
animation does not change its computed background color. Readiness must share
the initial text step's existing 3000ms deadline, without a fixed sleep or
changing production, fixture, CSS, browser, or global test timeouts.

After this observed precondition, retain the original strict assertions:
more than three colors, different before/end colors, stable node identity,
exact mixed body, final fresh list `["中", "文"]`, zero stable-block mutations,
no stable blue spans, and exactly one visible caret. Additionally verify that
the initial color is the canonical blue target and the final color is the
inherited foreground. Missing/replaced nodes, an empty fresh list, or failure
to reach blue must fail explicitly, rather than retrying the test.

Validation uses the installed official `e2e` / `@e2e-dev/web` runner against
the already-running combined Vite fixture on port 5214, with retries disabled.
The parent performs the subsequent full combined run and commit.
