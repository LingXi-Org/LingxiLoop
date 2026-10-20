# ✗ Whole text-part streaming tail › visualize text slices share the original text-part window

`e2e/web/streaming-tail-window.e2e.ts` · failed · 1.7s

**ASSERTION_FAILED**

```text
expected {"fresh":["one","two","three"],"carets":2} to equal {"fresh":["two","three"],"carets":1}
```

Look at: `e2e/web/streaming-tail-window.e2e.ts:94`  

## Steps

1. ✓ `app.open` `/scripts/streaming-browser-check.html?visualize=1` (1.4s) — `e2e/web/streaming-tail-window.e2e.ts:80`
2. ✓ `expect.toHaveText` `locator("#body")` (53ms) — `e2e/web/streaming-tail-window.e2e.ts:81`
3. ✓ `browser.evaluate` `` (98ms) — `e2e/web/streaming-tail-window.e2e.ts:82`

## Screen at failure

URL: `http://127.0.0.1:5204/scripts/streaming-browser-check.html?visualize=1`  

The screen as the agent reads it, one node per line: `#id role "name" text="…" [states]`.

```text
# Screen at failure
url: http://127.0.0.1:5204/scripts/streaming-browser-check.html?visualize=1
revision: b1
viewport: 1440x960
nodes: 6

#root document "连续正文浏览器回归"
 #n3 main
  #n4 text="one"
  #n5 text="two"
  #n6 text="生成完成后显示交互视图"
  #n7 text="three"
```

## Evidence

- screenshot `docs/evidence/issue-214-tail/split-red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__visualize_20text_20slices_20share_2-810cc902/default/attempt-0/screens…`
- log `docs/evidence/issue-214-tail/split-red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__visualize_20text_20slices_20share_2-810cc902/default/attempt-0/failure…`
- trace `docs/evidence/issue-214-tail/split-red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__visualize_20text_20slices_20share_2-810cc902/default/attempt-0/trace/t…`

<sub>e2e 0.17.0 · run `01a15737-98aa-7a96-9d4c-585fb4103bf6` · the whole run is in `report.json`</sub>
