# ✗ Whole text-part streaming tail › one word in a new block retains the preceding word across structural boundaries

`e2e/web/streaming-tail-window.e2e.ts` · failed · 1.6s

**ASSERTION_FAILED**

```text
expected [{"fresh":["one","two"],"carets":1},{"fresh":["one","two","three"],"carets":1},{"fresh":["one","two","three","four"],"carets":1},{"fresh":["甲","乙","丙"],"carets":1},{"fresh":[],"carets":0},{"fresh":["甲","乙","丙"],"carets":1}] to equal [{"fresh":["one","two"],"carets":1},{"fresh":["two","three"],"carets":1},{"fresh":["three","four"],"carets":1},{"fresh":["乙","丙"],"carets":1},{"fresh":["乙","丙"],"carets":1},{"fresh":["乙","丙"],"carets":1}]
```

Look at: `e2e/web/streaming-tail-window.e2e.ts:62`  

## Steps

1. ✓ `app.open` `/scripts/streaming-browser-check.html` (873ms) — `e2e/web/streaming-tail-window.e2e.ts:41`
2. ✓ `expect.toHaveText` `locator("#body")` (51ms) — `e2e/web/streaming-tail-window.e2e.ts:42`
3. ✓ `browser.evaluate` `` (402ms) — `e2e/web/streaming-tail-window.e2e.ts:43`

## Screen at failure

URL: `http://127.0.0.1:5204/scripts/streaming-browser-check.html`  

The screen as the agent reads it, one node per line: `#id role "name" text="…" [states]`.

```text
# Screen at failure
url: http://127.0.0.1:5204/scripts/streaming-browser-check.html
revision: b1
viewport: 1440x960
nodes: 7

#root document "连续正文浏览器回归"
 #n3 main
  #n4 text="甲"
  #n5 text="乙"
  #n6 list
   #n7 listitem "丙"
    #n8 text="丙"
```

## Evidence

- screenshot `docs/evidence/issue-214-tail/red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__one_20word_20in_20a_20new_20block_2-84b70b33/default/attempt-0/screenshots/0…`
- log `docs/evidence/issue-214-tail/red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__one_20word_20in_20a_20new_20block_2-84b70b33/default/attempt-0/failure/scree…`
- trace `docs/evidence/issue-214-tail/red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__one_20word_20in_20a_20new_20block_2-84b70b33/default/attempt-0/trace/trace.z…`

<sub>e2e 0.17.0 · run `01a15733-46ed-73bf-a5bf-33a3050b8757` · the whole run is in `report.json`</sub>
