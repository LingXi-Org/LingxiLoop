# ✗ legacy criteria keep separate native paragraphs on edit and reopen: plain

`e2e/content-boundaries/browser.e2e.ts` · failed · 14.4s

**ASSERTION_FAILED**

```text
expected ["Explain the first inference\\\n Verify the second result reviewed"] to have length 2, got 1
```

Look at: `e2e/content-boundaries/browser.e2e.ts:20`  

## Steps

1. ✓ `app.open` `/e2e/content-boundaries/fixture.html` (5.9s) — `e2e/content-boundaries/browser.e2e.ts:9`
2. ✓ `browser.evaluate` `` (76ms) — `e2e/content-boundaries/browser.e2e.ts:10`
3. ✓ `app.open` `/e2e/content-boundaries/fixture.html` (1.6s) — `e2e/content-boundaries/browser.e2e.ts:11`
4. ✓ `expect.toBeVisible` `getByLabel("验收标准")` (5.6s) — `e2e/content-boundaries/browser.e2e.ts:13`
5. ✓ `browser.evaluate` `` (4ms) — `e2e/content-boundaries/browser.e2e.ts:14`
6. ✓ `locator.focus` `getByLabel("验收标准")` (47ms) — `e2e/content-boundaries/browser.e2e.ts:15`
7. ✓ `browser.keyboard.press` `Control+End` (9ms) — `e2e/content-boundaries/browser.e2e.ts:15`
8. ✓ `browser.keyboard.type` `9 chars` (136ms) — `e2e/content-boundaries/browser.e2e.ts:15`
9. ✓ `locator.tap` `getByRole("button", name: "保存修改")` (109ms) — `e2e/content-boundaries/browser.e2e.ts:16`
10. ✓ `browser.evaluate` `` (13ms) — `e2e/content-boundaries/browser.e2e.ts:17`
11. ✓ `browser.evaluate` `` (8ms) — `e2e/content-boundaries/browser.e2e.ts:18`

## Screen at failure

URL: `http://127.0.0.1:5391/e2e/content-boundaries/fixture.html`  

The screen as the agent reads it, one node per line: `#id role "name" text="…" [states]`.

```text
# Screen at failure
url: http://127.0.0.1:5391/e2e/content-boundaries/fixture.html
revision: b1
viewport: 1440x1000
nodes: 23

#root document "Content boundaries fixture"
 #n5 "作业草稿"
  #n6 text="作业草稿"
  #n7 text="确认下面的内容后，作业才会发布到课程论坛。"
  #n8 text="作业标题"
  #n9 textbox "作业标题" value="Synthetic criteria"
  #n10 textbox "作业要求" value="Synthetic current instructions"
   #n11 text="Synthetic current instructions"
  #n12 text="30 / 20,000"
  #n13 button "附件"
  #n14 button "添加附件"
  #n15 text="可粘贴文件，或把图片拖入正文"
  #n16 group
   #n17 text="附加链接"
  #n18 heading "验收标准"
  #n19 textbox "验收标准" value="Explain the first inference\n Verify the second result reviewed"
   #n20 text="Explain the first inference Verify the second result reviewed"
  #n21 text="64 / 10,000"
  #n22 text="每段一条标准，最多 20 条；保存后按标准核验作答。"
  #n23 text="截止时间"
  #n24 textbox "截止时间"
  #n25 button "保存修改" [disabled]
  #n26 button "确认发布" [disabled]
```

## Evidence

- screenshot `.codex-tmp/content-boundary-red/artifacts/native/e2e_content-boundaries_browser.e2e.ts__legacy_20criteria_20keep_20separate_20native_20paragraphs_20on_20edit_20-410f71fc/default/attempt-0/screenshots…`
- log `.codex-tmp/content-boundary-red/artifacts/native/e2e_content-boundaries_browser.e2e.ts__legacy_20criteria_20keep_20separate_20native_20paragraphs_20on_20edit_20-410f71fc/default/attempt-0/failure/scr…`
- trace `.codex-tmp/content-boundary-red/artifacts/native/e2e_content-boundaries_browser.e2e.ts__legacy_20criteria_20keep_20separate_20native_20paragraphs_20on_20edit_20-410f71fc/default/attempt-0/trace/trace…`

<sub>e2e 0.17.0 · run `01a1579d-1088-7212-9a03-b39684bb8768` · the whole run is in `report.json`</sub>
