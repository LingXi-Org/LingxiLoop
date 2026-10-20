# ✗ Whole text-part streaming tail › inline boundaries preserve whitespace without counting it as a word

`e2e/web/streaming-tail-window.e2e.ts` · failed · 5.8s

**ASSERTION_FAILED**

```text
expected [{"text":"one two","fresh":["one","two"]},{"text":"","fresh":[]},{"text":"one\t  two","fresh":["\t  ","two"]},{"text":"甲 乙","fresh":["甲","乙"]},{"text":"","fresh":[]}] to equal [{"text":"one two","fresh":["one","two"]},{"text":"one two","fresh":["one","two"]},{"text":"one\t  two","fresh":["one","two"]},{"text":"甲 乙","fresh":["甲","乙"]},{"text":"甲 乙","fresh":["甲","乙"]}]
```

Look at: `e2e/web/streaming-tail-window.e2e.ts:32`  

## Steps

1. ✓ `app.open` `/scripts/streaming-browser-check.html` (5.0s) — `e2e/web/streaming-tail-window.e2e.ts:12`
2. ✓ `expect.toHaveText` `locator("#body")` (75ms) — `e2e/web/streaming-tail-window.e2e.ts:13`
3. ✓ `browser.evaluate` `` (325ms) — `e2e/web/streaming-tail-window.e2e.ts:14`

## Screen at failure

URL: `http://127.0.0.1:5204/scripts/streaming-browser-check.html`  

The screen as the agent reads it, one node per line: `#id role "name" text="…" [states]`.

```text
# Screen at failure
url: http://127.0.0.1:5204/scripts/streaming-browser-check.html
revision: b1
viewport: 1440x960
nodes: 3

#root document "连续正文浏览器回归"
 #n3 main
  #n4 text="**"
```

## Evidence

- screenshot `docs/evidence/issue-214-tail/red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__inline_20boundaries_20preserve_20wh-e0a058db/default/attempt-0/screenshots/0…`
- log `docs/evidence/issue-214-tail/red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__inline_20boundaries_20preserve_20wh-e0a058db/default/attempt-0/failure/scree…`
- trace `docs/evidence/issue-214-tail/red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__inline_20boundaries_20preserve_20wh-e0a058db/default/attempt-0/trace/trace.z…`

<sub>e2e 0.17.0 · run `01a15733-46ed-73bf-a5bf-33a3050b8757` · the whole run is in `report.json`</sub>
