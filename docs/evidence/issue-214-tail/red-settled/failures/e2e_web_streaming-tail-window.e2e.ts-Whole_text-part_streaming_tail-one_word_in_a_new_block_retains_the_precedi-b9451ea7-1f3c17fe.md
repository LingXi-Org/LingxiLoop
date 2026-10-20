# ✗ Whole text-part streaming tail › one word in a new block retains the preceding word across structural boundaries

`e2e/web/streaming-tail-window.e2e.ts` · failed · 1.5s

**ASSERTION_FAILED**

```text
expected [{"fresh":["one","two"],"carets":1},{"fresh":["one","two","three"],"carets":1},{"fresh":["one","two","three","four"],"carets":1},{"fresh":["甲","乙","丙"],"carets":1},{"fresh":["甲","乙","丙"],"carets":1},{"fresh":["甲","乙","丙"],"carets":1}] to equal [{"fresh":["one","two"],"carets":1},{"fresh":["two","three"],"carets":1},{"fresh":["three","four"],"carets":1},{"fresh":["乙","丙"],"carets":1},{"fresh":["乙","丙"],"carets":1},{"fresh":["乙","丙"],"carets":1}]
```

Look at: `e2e/web/streaming-tail-window.e2e.ts:68`  

## Steps

1. ✓ `app.open` `/scripts/streaming-browser-check.html` (839ms) — `e2e/web/streaming-tail-window.e2e.ts:45`
2. ✓ `expect.toHaveText` `locator("#body")` (44ms) — `e2e/web/streaming-tail-window.e2e.ts:46`
3. ✓ `browser.evaluate` `` (465ms) — `e2e/web/streaming-tail-window.e2e.ts:47`

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

- screenshot `docs/evidence/issue-214-tail/red-settled/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__one_20word_20in_20a_20new_20block_2-84b70b33/default/attempt-0/scree…`
- log `docs/evidence/issue-214-tail/red-settled/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__one_20word_20in_20a_20new_20block_2-84b70b33/default/attempt-0/failu…`
- trace `docs/evidence/issue-214-tail/red-settled/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__one_20word_20in_20a_20new_20block_2-84b70b33/default/attempt-0/trace…`

<sub>e2e 0.17.0 · run `01a15735-129e-7a93-bda6-49e3a14bec00` · the whole run is in `report.json`</sub>
