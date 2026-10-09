# ✗ Composable interactive explanations › reloading after a save conflict keeps an unconfirmed action retryable with the same identity

`e2e/web/interactive-ui.e2e.ts` · failed · 27.5s

**ASSERTION_FAILED**

```text
expect.toBeEnabled failed
locator: getByRole("button", name: "重试提交")
expected: enabled
observed: no node (match count 0)
```

Look at: `node_modules/e2e/dist/expect/async.js:112`  

## Steps

1. ✓ `app.open` `/e2e/interactive-ui.html?mode=action-reload` (9.7s) — `node_modules/e2e/dist/run/steps.js:26`
2. ✓ `expect.toBeEnabled` `getByRole("button", name: "解释当前结果")` (206ms) — `node_modules/e2e/dist/run/steps.js:26`
3. ✓ `locator.tap` `getByRole("button", name: "解释当前结果")` (216ms) — `node_modules/e2e/dist/run/steps.js:26`
4. ✓ `expect.toHaveAttribute` `locator("[data-fixture-actions]")` (21ms) — `node_modules/e2e/dist/run/steps.js:26`
5. ✓ `locator.focus` `getByRole("slider", name: "发射角度")` (36ms) — `node_modules/e2e/dist/run/steps.js:26`
6. ✓ `browser.keyboard.press` `ArrowRight` (95ms) — `node_modules/e2e/dist/run/steps.js:26`
7. ✓ `expect.toBeVisible` `getByRole("button", name: "重新载入")` (792ms) — `node_modules/e2e/dist/run/steps.js:26`
8. ✓ `locator.tap` `getByRole("button", name: "重新载入")` (415ms) — `node_modules/e2e/dist/run/steps.js:26`
9. ✗ `expect.toBeEnabled` `getByRole("button", name: "重试提交")` (15.1s) — **ASSERTION_FAILED** — `node_modules/e2e/dist/run/steps.js:26`

## Screen at failure

URL: `http://127.0.0.1:5189/e2e/interactive-ui.html?mode=action-reload`  

The screen as the agent reads it, one node per line: `#id role "name" text="…" [states]`.

```text
# Screen at failure
url: http://127.0.0.1:5189/e2e/interactive-ui.html?mode=action-reload
revision: b1
viewport: 1440x960
nodes: 40

#root document "Interactive explanation acceptance fixture"
 #n8 main
  #n9 text="组件验收：合成消息与个人状态接口"
  #n10 region "运动与选择"
   #n11 heading "运动与选择"
   #n12 text="发射角度"
   #n13 status "45 °"
   #n14 "发射角度"
    #n15 slider "发射角度"
   #n16 figure "抛射轨迹"
    #n17 application
    #n18 text="射程 40.7747 m · 飞行时间 2.88321 s · 最大高度 10.1937 m"
   #n19 region "探索步骤"
    #n20 heading "探索步骤"
    #n21 list
     #n22 listitem "先预测 改变角度会怎样影响射程？"
      #n23 text="先预测"
      #n24 text="改变角度会怎样影响射程？"
    #n25 button "上一步" [disabled]
    #n26 button "下一步"
    #n27 text="1 / 2"
   #n28 text="你的预测"
   #n29 textbox "你的预测"
   #n30 region "概念对比"
    #n31 table "概念对比"
     #n32 rowgroup
      #n33 row "条件 结论"
       #n34 columnheader "条件"
       #n35 columnheader "结论"
     #n36 rowgroup
      #n37 row "相同速度与起落高度 45°时射程最大"
       #n38 cell "相同速度与起落高度"
       #n39 cell "45°时射程最大"
      #n40 row "存在空气阻力 需要不同模型"
       #n41 cell "存在空气阻力"
       #n42 cell "需要不同模型"
   #n43 button "解释当前结果" [disabled]
  #n44 group
   #n45 text="文字讲解"
 #n46 button "Open OpenUI Inspect"
```

## Evidence

- screenshot `artifacts/interactive-ui/action-reload-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__reloading_20after_20a_20save_20conflict-19c19b94/default/attempt-0/…`
- log `artifacts/interactive-ui/action-reload-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__reloading_20after_20a_20save_20conflict-19c19b94/default/attempt-0/…`
- trace `artifacts/interactive-ui/action-reload-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__reloading_20after_20a_20save_20conflict-19c19b94/default/attempt-0/…`

<sub>e2e 0.17.0 · run `01a11f05-36d2-7d12-8d08-80b8f79e4b8f` · the whole run is in `report.json`</sub>
