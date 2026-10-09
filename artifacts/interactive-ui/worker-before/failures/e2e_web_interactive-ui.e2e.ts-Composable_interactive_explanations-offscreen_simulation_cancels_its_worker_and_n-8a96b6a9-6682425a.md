# ✗ Composable interactive explanations › offscreen simulation cancels its worker and never labels old results as new parameters

`e2e/web/interactive-ui.e2e.ts` · failed · 18.6s

**ASSERTION_FAILED**

```text
expect.toHaveCount failed
locator: locator("[data-result=\"clt\"]")
expected: count 0
observed: count 1 (match count 1)
```

Look at: `node_modules/e2e/dist/expect/async.js:112`  

## Steps

1. ✓ `browser.addInitScript` `function` (12ms) — `node_modules/e2e/dist/run/steps.js:26`
2. ✓ `browser.setViewport` `` (2ms) — `node_modules/e2e/dist/run/steps.js:26`
3. ✓ `app.open` `/e2e/interactive-ui.html?scenario=worker` (1.8s) — `node_modules/e2e/dist/run/steps.js:26`
4. ✓ `locator.scrollIntoView` `getByRole("figure", name: "样本均值分布")` (177ms) — `node_modules/e2e/dist/run/steps.js:26`
5. ✓ `expect.toBeVisible` `locator("[data-result=\"clt\"]")` (306ms) — `node_modules/e2e/dist/run/steps.js:26`
6. ✓ `locator.scrollIntoView` `getByRole("button", name: "增加样本量")` (54ms) — `node_modules/e2e/dist/run/steps.js:26`
7. ✓ `browser.evaluate` `` (10ms) — `node_modules/e2e/dist/run/steps.js:26`
8. ✓ `browser.evaluate` `` (56ms) — `node_modules/e2e/dist/run/steps.js:26`
9. ✓ `locator.tap` `getByRole("button", name: "增加样本量")` (142ms) — `node_modules/e2e/dist/run/steps.js:26`
10. ✗ `expect.toHaveCount` `locator("[data-result=\"clt\"]")` (15.1s) — **ASSERTION_FAILED** — `node_modules/e2e/dist/run/steps.js:26`

## Screen at failure

URL: `http://127.0.0.1:5189/e2e/interactive-ui.html?scenario=worker`  

The screen as the agent reads it, one node per line: `#id role "name" text="…" [states]`.

```text
# Screen at failure
url: http://127.0.0.1:5189/e2e/interactive-ui.html?scenario=worker
revision: b1
viewport: 390x844
nodes: 8

#root document "Interactive explanation acceptance fixture"
 #n129 main
  #n130 button "增加样本量" [focused]
  #n131 text="当前样本量：6"
  #n132 figure "样本均值分布"
   #n133 application
   #n134 text="样本均值：0.49898（理论 0.5）；方差：0.016289（理论 0.0166667）；重复 5000 次"
 #n135 button "Open OpenUI Inspect"
```

## Evidence

- screenshot `artifacts/interactive-ui/worker-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__offscreen_20simulation_20cancels_20its_-6c717a1d/default/attempt-0/screens…`
- log `artifacts/interactive-ui/worker-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__offscreen_20simulation_20cancels_20its_-6c717a1d/default/attempt-0/failure…`
- trace `artifacts/interactive-ui/worker-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__offscreen_20simulation_20cancels_20its_-6c717a1d/default/attempt-0/trace/t…`

<sub>e2e 0.17.0 · run `01a11f07-b0ed-7b69-9093-3776408d3648` · the whole run is in `report.json`</sub>
