# ✗ Composable interactive explanations › duplicate clicks submit once and uncertain failures retry the same request

`e2e/web/interactive-ui.e2e.ts` · failed · 2.3s

**ASSERTION_FAILED**

```text
expected "3" to be "2"
```

Look at: `node_modules/e2e/dist/expect/values.js:9`  

## Steps

1. ✓ `app.open` `/e2e/interactive-ui.html?mode=action-retry` (668ms) — `node_modules/e2e/dist/run/steps.js:26`
2. ✓ `expect.toBeEnabled` `getByRole("button", name: "解释当前结果")` (355ms) — `node_modules/e2e/dist/run/steps.js:26`
3. ✓ `browser.evaluate` `` (29ms) — `node_modules/e2e/dist/run/steps.js:26`
4. ✓ `expect.toBeVisible` `getByRole("button", name: "重试提交")` (27ms) — `node_modules/e2e/dist/run/steps.js:26`
5. ✓ `locator.tap` `getByRole("button", name: "重试提交")` (185ms) — `node_modules/e2e/dist/run/steps.js:26`
6. ✓ `expect.toBeVisible` `getByText("已提交")` (24ms) — `node_modules/e2e/dist/run/steps.js:26`
7. ✓ `locator.tap` `getByRole("button", name: "解释当前结果")` (90ms) — `node_modules/e2e/dist/run/steps.js:26`

## Screen at failure

URL: `http://127.0.0.1:5190/e2e/interactive-ui.html?mode=action-retry`  

The screen as the agent reads it, one node per line: `#id role "name" text="…" [states]`.

```text
# Screen at failure
url: http://127.0.0.1:5190/e2e/interactive-ui.html?mode=action-retry
revision: b1
viewport: 1440x960
nodes: 40

#root document "Interactive explanation acceptance fixture"
 #n10 main
  #n11 text="组件验收：合成消息与个人状态接口"
  #n12 region "运动与选择"
   #n13 heading "运动与选择"
   #n14 text="发射角度"
   #n15 status "45 °"
   #n16 "发射角度"
    #n17 slider "发射角度"
   #n18 figure "抛射轨迹"
    #n19 application
    #n20 text="射程 40.7747 m · 飞行时间 2.88321 s · 最大高度 10.1937 m"
   #n21 region "探索步骤"
    #n22 heading "探索步骤"
    #n23 list
     #n24 listitem "先预测 改变角度会怎样影响射程？"
      #n25 text="先预测"
      #n26 text="改变角度会怎样影响射程？"
    #n27 button "上一步" [disabled]
    #n28 button "下一步"
    #n29 text="1 / 2"
   #n30 text="你的预测"
   #n31 textbox "你的预测"
   #n32 region "概念对比"
    #n33 table "概念对比"
     #n34 rowgroup
      #n35 row "条件 结论"
       #n36 columnheader "条件"
       #n37 columnheader "结论"
     #n38 rowgroup
      #n39 row "相同速度与起落高度 45°时射程最大"
       #n40 cell "相同速度与起落高度"
       #n41 cell "45°时射程最大"
      #n42 row "存在空气阻力 需要不同模型"
       #n43 cell "存在空气阻力"
       #n44 cell "需要不同模型"
   #n45 button "解释当前结果"
  #n46 status "已提交"
  #n47 group
   #n48 text="文字讲解"
```

## Evidence

- screenshot `artifacts/interactive-ui/idempotency-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__duplicate_20clicks_20submit_20once_20an-7c6a3749/default/attempt-0/sc…`
- log `artifacts/interactive-ui/idempotency-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__duplicate_20clicks_20submit_20once_20an-7c6a3749/default/attempt-0/fa…`
- trace `artifacts/interactive-ui/idempotency-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__duplicate_20clicks_20submit_20once_20an-7c6a3749/default/attempt-0/tr…`

<sub>e2e 0.17.0 · run `01a11ef0-f221-70e0-8d27-96abef07fa08` · the whole run is in `report.json`</sub>
