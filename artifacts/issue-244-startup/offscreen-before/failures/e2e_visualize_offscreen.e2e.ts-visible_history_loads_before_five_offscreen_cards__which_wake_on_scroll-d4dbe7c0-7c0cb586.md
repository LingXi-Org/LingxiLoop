# ✗ visible history loads before five offscreen cards, which wake on scroll

`e2e/visualize/offscreen.e2e.ts` · failed · 11.3s

**ASSERTION_FAILED**

```text
expected 6 to be 1
```

Look at: `e2e/visualize/offscreen.e2e.ts:43`  

## Steps

1. ✓ `app.open` `/e2e/visualize/loading.html?count=6&offscreen` (1.3s) — `e2e/visualize/offscreen.e2e.ts:7`
2. ✓ `browser.evaluate` `` (4.9s) — `e2e/visualize/offscreen.e2e.ts:8`
3. ✓ `app.screenshot` `first-visible-history` (741ms) — `e2e/visualize/offscreen.e2e.ts:41`

## Screen at failure

URL: `http://127.0.0.1:5193/e2e/visualize/loading.html?count=6&offscreen`  

The screen as the agent reads it, one node per line: `#id role "name" text="…" [states]`.

```text
# Screen at failure
url: http://127.0.0.1:5193/e2e/visualize/loading.html?count=6&offscreen
revision: b1
viewport: 1440x960
nodes: 195

#root document
 #n2 main
  #n3 navigation
   #n4 button "进入 A"
   #n5 button "进入 B"
   #n6 button "退出"
   #n7 textbox "对话输入"
  #n8 text="对话正文始终可读，以下为已保存的完整交互内容。"
  #n9 testid="gen-ui-card"
   #n10 testid="gen-ui-anchor"
    #n11 iframe "交互视图" testid="plugin-ui-webview"
     #n3001 document
      #n3002 iframe "交互视图"
       #n5956 document
        #n5957 tablist "Fixture views"
         #n5958 tab "Design" [selected]
         #n5959 tab "Data"
        #n5960 tabpanel "Design"
         #n5961 group "Player designs"
          #n5962 group "Compact design"
          #n5963 "Player settings"
          #n5964 heading "Field recordings"
          #n5965 text="Rain in the garden"
          #n5966 button "Pause"
          #n5967 text="Pause"
          #n5968 status "Rendered design" text="radius=18; accent=#7c3aed; playing=true; density=normal"
          #n5969 button "Saved count: 5"
          #n5970 button "Show detail"
          #n5971 button "Previous variant"
          #n5972 group
          #n5973 text="1 / 2"
          #n5974 text="Compact"
          #n5975 button "Next variant"
          #n5976 status
         #n5977 button "Explain saved count"
         #n5978 link "Reference" href="https://example.com/visualize-acceptance"
   #n12 toolbar "交互内容 1" testid="gen-ui-actions"
    #n13 button "复制图像"
    #n14 button "调整设计"
    #n15 button "放大"
  #n16 testid="gen-ui-card"
   #n17 testid="gen-ui-anchor"
    #n18 iframe "交互视图" testid="plugin-ui-webview"
     #n8909 document
      #n8910 iframe "交互视图"
       #n11839 document
        #n11840 tablist "Fixture views"
         #n11841 tab "Design" [selected]
         #n11842 tab "Data"
        #n11843 tabpanel "Design"
         #n11844 group "Player designs"
          #n11845 group "Compact design"
          #n11846 "Player settings"
          #n11847 heading "Field recordings"
          #n11848 text="Rain in the garden"
          #n11849 button "Pause"
          #n11850 text="Pause"
          #n11851 status "Rendered design" text="radius=18; accent=#7c3aed; playing=true; density=normal"
          #n11852 button "Saved count: 5"
          #n11853 button "Show detail"
          #n11854 button "Previous variant"
          #n11855 group
          #n11856 text="1 / 2"
          #n11857 text="Compact"
          #n11858 button "Next variant"
          #n11859 status
         #n11860 button "Explain saved count"
         #n11861 link "Reference" href="https://example.com/visualize-acceptance"
   #n19 toolbar "交互内容 2" testid="gen-ui-actions"
    #n20 button "复制图像"
    #n21 button "放大"
  #n22 testid="gen-ui-card"
   #n23 testid="gen-ui-anchor"
    #n24 iframe "交互视图" testid="plugin-ui-webview"
     #n14767 document
      #n14768 iframe "交互视图"
       #n17672 document
        #n17673 tablist "Fixture views"
         #n17674 tab "Design" [selected]
         #n17675 tab "Data"
        #n17676 tabpanel "Design"
         #n17677 group "Player designs"
          #n17678 group "Compact design"
          #n17679 "Player settings"
          #n17680 heading "Field recordings"
          #n17681 text="Rain in the garden"
          #n17682 button "Pause"
          #n17683 text="Pause"
          #n17684 status "Rendered design" text="radius=18; accent=#7c3aed; playing=true; density=normal"
          #n17685 button "Saved count: 5"
          #n17686 button "Show detail"
          #n17687 button "Previous variant"
          #n17688 group
          #n17689 text="1 / 2"
          #n17690 text="Compact"
          #n17691 button "Next variant"
          #n17692 status
         #n17693 button "Explain saved count"
         #n17694 link "Reference" href="https://example.com/visualize-acceptance"
   #n25 toolbar "交互内容 3" testid="gen-ui-actions"
    #n26 button "复制图像"
    #n27 button "放大"
  #n28 testid="gen-ui-card"
   #n29 testid="gen-ui-anchor"
    #n30 iframe "交互视图" testid="plugin-ui-webview"
     #n20575 document
      #n20576 iframe "交互视图"
       #n23455 document
        #n23456 tablist "Fixture views"
         #n23457 tab "Design" [selected]
         #n23458 tab "Data"
        #n23459 tabpanel "Design"
         #n23460 group "Player designs"
          #n23461 group "Compact design"
          #n23462 "Player settings"
          #n23463 heading "Field recordings"
          #n23464 text="Rain in the garden"
          #n23465 button "Pause"
          #n23466 text="Pause"
          #n23467 status "Rendered design" text="radius=18; accent=#7c3aed; playing=true; density=normal"
          #n23468 button "Saved count: 5"
          #n23469 button "Show detail"
          #n23470 button "Previous variant"
          #n23471 group
          #n23472 text="1 / 2"
          #n23473 text="Compact"
          #n23474 button "Next variant"
          #n23475 status
         #n23476 button "Explain saved count"
         #n23477 link "Reference" href="https://example.com/visualize-acceptance"
   #n31 toolbar "交互内容 4" testid="gen-ui-actions"
    #n32 button "复制图像"
    #n33 button "放大"
  #n34 testid="gen-ui-card"
   #n35 testid="gen-ui-anchor"
    #n36 iframe "交互视图" testid="plugin-ui-webview"
     #n26333 document
      #n26334 iframe "交互视图"
       #n29188 document
        #n29189 tablist "Fixture views"
         #n29190 tab "Design" [selected]
         #n29191 tab "Data"
        #n29192 tabpanel "Design"
         #n29193 group "Player designs"
          #n29194 group "Compact design"
          #n29195 "Player settings"
          #n29196 heading "Field recordings"
          #n29197 text="Rain in the garden"
          #n29198 button "Pause"
          #n29199 text="Pause"
          #n29200 status "Rendered design" text="radius=18; accent=#7c3aed; playing=true; density=normal"
          #n29201 button "Saved count: 5"
          #n29202 button "Show detail"
          #n29203 button "Previous variant"
          #n29204 group
          #n29205 text="1 / 2"
          #n29206 text="Compact"
          #n29207 button "Next variant"
          #n29208 status
         #n29209 button "Explain saved count"
         #n29210 link "Reference" href="https://example.com/visualize-acceptance"
   #n37 toolbar "交互内容 5" testid="gen-ui-actions"
    #n38 button "复制图像"
    #n39 button "放大"
  #n40 testid="gen-ui-card"
   #n41 testid="gen-ui-anchor"
    #n42 iframe "交互视图" testid="plugin-ui-webview"
     #n32041 document
      #n32042 iframe "交互视图"
       #n34871 document
        #n34872 tablist "Fixture views"
         #n34873 tab "Design" [selected]
         #n34874 tab "Data"
        #n34875 tabpanel "Design"
         #n34876 group "Player designs"
          #n34877 group "Compact design"
          #n34878 "Player settings"
          #n34879 heading "Field recordings"
          #n34880 text="Rain in the garden"
          #n34881 button "Pause"
          #n34882 text="Pause"
          #n34883 status "Rendered design" text="radius=18; accent=#7c3aed; playing=true; density=normal"
          #n34884 button "Saved count: 5"
          #n34885 button "Show detail"
          #n34886 button "Previous variant"
          #n34887 group
          #n34888 text="1 / 2"
          #n34889 text="Compact"
          #n34890 button "Next variant"
          #n34891 status
         #n34892 button "Explain saved count"
         #n34893 link "Reference" href="https://example.com/visualize-acceptance"
   #n43 toolbar "交互内容 6" testid="gen-ui-actions"
    #n44 button "复制图像"
    #n45 button "放大"
```

## Evidence

- screenshot `.e2e/244-offscreen-before/artifacts/web/e2e_visualize_offscreen.e2e.ts__visible_20history_20loads_20before_20five_20offscreen_20cards_2C_20which_20wake-69dbd8ec/default/attempt-0/screenshots/002-fail…`
- log `.e2e/244-offscreen-before/artifacts/web/e2e_visualize_offscreen.e2e.ts__visible_20history_20loads_20before_20five_20offscreen_20cards_2C_20which_20wake-69dbd8ec/default/attempt-0/failure/screen.txt`
- screenshot `.e2e/244-offscreen-before/artifacts/web/e2e_visualize_offscreen.e2e.ts__visible_20history_20loads_20before_20five_20offscreen_20cards_2C_20which_20wake-69dbd8ec/default/attempt-0/screenshots/001-firs…`
- trace `.e2e/244-offscreen-before/artifacts/web/e2e_visualize_offscreen.e2e.ts__visible_20history_20loads_20before_20five_20offscreen_20cards_2C_20which_20wake-69dbd8ec/default/attempt-0/trace/trace.zip`

<sub>e2e 0.17.0 · run `01a15a45-554f-7b2b-b708-ccb51b19e438` · the whole run is in `report.json`</sub>
