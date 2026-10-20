# ✗ Official element integration › Chinese and mixed leaves settle continuously without replaying stable blocks

`e2e/web/streaming-text.e2e.ts` · failed · 6.0s

**ASSERTION_FAILED**

```text
expected true to be false
```

Look at: `e2e/web/streaming-text.e2e.ts:203`  

## Steps

1. ✓ `app.open` `/scripts/streaming-browser-check.html` (2.1s) — `e2e/web/streaming-text.e2e.ts:161`
2. ✓ `expect.toHaveText` `locator("#body")` (293ms) — `e2e/web/streaming-text.e2e.ts:162`
3. ✓ `browser.evaluate` `` (2.1s) — `e2e/web/streaming-text.e2e.ts:163`

## Screen at failure

URL: `http://127.0.0.1:5214/scripts/streaming-browser-check.html`  

The screen as the agent reads it, one node per line: `#id role "name" text="…" [states]`.

```text
# Screen at failure
url: http://127.0.0.1:5214/scripts/streaming-browser-check.html
revision: b1
viewport: 1440x960
nodes: 15

#root document "连续正文浏览器回归"
 #n3 main
  #n4 text="甲"
  #n5 text="乙"
  #n6 text="丙"
  #n7 text="丁"
  #n8 text="English"
  #n9 text="中"
  #n10 text="文"
  #n11 text="尾"
  #n12 text="部"
  #n13 text="继"
  #n14 text="续"
  #n15 text="增"
  #n16 text="长"
```

## Evidence

- screenshot `artifacts/ui-release-combination-after-space/artifacts/web/e2e_web_streaming-text.e2e.ts__Official_20element_20integration__Chinese_20and_20mixed_20leaves_20settle_20cont-8388ac22/default/attempt-0/s…`
- log `artifacts/ui-release-combination-after-space/artifacts/web/e2e_web_streaming-text.e2e.ts__Official_20element_20integration__Chinese_20and_20mixed_20leaves_20settle_20cont-8388ac22/default/attempt-0/f…`
- trace `artifacts/ui-release-combination-after-space/artifacts/web/e2e_web_streaming-text.e2e.ts__Official_20element_20integration__Chinese_20and_20mixed_20leaves_20settle_20cont-8388ac22/default/attempt-0/t…`

<sub>e2e 0.17.0 · run `01a15759-0f4f-729d-b0e4-eaa45150d63a` · the whole run is in `report.json`</sub>
