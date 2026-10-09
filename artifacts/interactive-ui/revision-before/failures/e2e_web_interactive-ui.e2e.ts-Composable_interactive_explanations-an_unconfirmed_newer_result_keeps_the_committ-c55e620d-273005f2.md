# ✗ Composable interactive explanations › an unconfirmed newer result keeps the committed revision editable until native delivery

`e2e/web/interactive-ui.e2e.ts` · failed · 16.8s

**ASSERTION_FAILED**

```text
expect.toBeEnabled failed
locator: locator("[data-revision=\"1\"]") >> getByRole("slider", name: "发射角度")
expected: enabled
observed: states: disabled (match count 1)
```

Look at: `node_modules/e2e/dist/expect/async.js:112`  

## Steps

1. ✓ `app.open` `/e2e/interactive-ui.html?mode=revision-pending` (1.1s) — `node_modules/e2e/dist/run/steps.js:26`
2. ✗ `expect.toBeEnabled` `locator("[data-revision=\"1\"]") >> getByRole("slider", name: "发射角度")` (15.1s) — **ASSERTION_FAILED** — `node_modules/e2e/dist/run/steps.js:26`

## Screen at failure

URL: `http://127.0.0.1:5189/e2e/interactive-ui.html?mode=revision-pending`  

The screen as the agent reads it, one node per line: `#id role "name" text="…" [states]`.

```text
# Screen at failure
url: http://127.0.0.1:5189/e2e/interactive-ui.html?mode=revision-pending
revision: b1
viewport: 1440x960
nodes: 79

#root document "Interactive explanation acceptance fixture"
 #n119 main
  #n120 button "确认新版本送达"
  #n121 text="此版本仅供查看。"
  #n122 region "运动与选择"
   #n123 heading "运动与选择"
   #n124 text="发射角度"
   #n125 status "45 °"
   #n126 "发射角度" [disabled]
    #n127 slider "发射角度" [disabled]
   #n128 figure "抛射轨迹"
    #n129 application
    #n130 text="射程 40.7747 m · 飞行时间 2.88321 s · 最大高度 10.1937 m"
   #n131 region "探索步骤"
    #n132 heading "探索步骤"
    #n133 list
     #n134 listitem "先预测 改变角度会怎样影响射程？"
      #n135 text="先预测"
      #n136 text="改变角度会怎样影响射程？"
    #n137 button "上一步" [disabled]
    #n138 button "下一步" [disabled]
    #n139 text="1 / 2"
   #n140 text="你的预测"
   #n141 textbox "你的预测" [disabled]
   #n142 region "概念对比"
    #n143 table "概念对比"
     #n144 rowgroup
      #n145 row "条件 结论"
       #n146 columnheader "条件"
       #n147 columnheader "结论"
     #n148 rowgroup
      #n149 row "相同速度与起落高度 45°时射程最大"
       #n150 cell "相同速度与起落高度"
       #n151 cell "45°时射程最大"
      #n152 row "存在空气阻力 需要不同模型"
       #n153 cell "存在空气阻力"
       #n154 cell "需要不同模型"
   #n155 button "解释当前结果" [disabled]
  #n156 group
   #n157 text="文字讲解"
  #n158 text="此版本仅供查看。"
  #n159 status "讲解正在更新，完成后可提交。"
  #n160 region "运动与选择"
   #n161 heading "运动与选择"
   #n162 text="发射角度"
   #n163 status "45 °"
   #n164 "发射角度" [disabled]
    #n165 slider "发射角度" [disabled]
   #n166 figure "抛射轨迹"
    #n167 application
    #n168 text="射程 40.7747 m · 飞行时间 2.88321 s · 最大高度 10.1937 m"
   #n169 region "探索步骤"
    #n170 heading "探索步骤"
    #n171 list
     #n172 listitem "先预测 改变角度会怎样影响射程？"
      #n173 text="先预测"
      #n174 text="改变角度会怎样影响射程？"
    #n175 button "上一步" [disabled]
    #n176 button "下一步" [disabled]
    #n177 text="1 / 2"
   #n178 text="你的预测"
   #n179 textbox "你的预测" [disabled]
   #n180 region "概念对比"
    #n181 table "概念对比"
     #n182 rowgroup
      #n183 row "条件 结论"
       #n184 columnheader "条件"
       #n185 columnheader "结论"
     #n186 rowgroup
      #n187 row "相同速度与起落高度 45°时射程最大"
       #n188 cell "相同速度与起落高度"
       #n189 cell "45°时射程最大"
      #n190 row "存在空气阻力 需要不同模型"
       #n191 cell "存在空气阻力"
       #n192 cell "需要不同模型"
   #n193 button "解释当前结果" [disabled]
  #n194 group
   #n195 text="文字讲解"
 #n196 button "Open OpenUI Inspect"
```

## Evidence

- screenshot `artifacts/interactive-ui/revision-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__an_20unconfirmed_20newer_20result_20kee-fe85c659/default/attempt-0/scree…`
- log `artifacts/interactive-ui/revision-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__an_20unconfirmed_20newer_20result_20kee-fe85c659/default/attempt-0/failu…`
- trace `artifacts/interactive-ui/revision-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__an_20unconfirmed_20newer_20result_20kee-fe85c659/default/attempt-0/trace…`

<sub>e2e 0.17.0 · run `01a11f07-4e0f-76ce-9a51-497a03b77174` · the whole run is in `report.json`</sub>
