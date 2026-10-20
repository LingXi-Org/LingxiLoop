# ✗ all 14 default blocks and official free math and diagram blocks remain insertable

`e2e/content-editor/browser.e2e.ts` · failed · 14.7s

**ASSERTION_FAILED**

```text
expected "[{\"id\":\"64658c30-9e2d-44aa-b618-be9d73d33f94\",\"type\":\"heading\",\"props\":{\"backgroundColor\":\"default\",\"textColor\":\"default\",\"textAlignment\":\"left\",\"level\":1,\"isToggleable\":false},\"content\":[{\"type\":\"text\",\"text\":\"原生粗体\",\"styles\":{}}],\"children\":[]}]" to contain "\"bold\":true"
```

Look at: `e2e/content-editor/browser.e2e.ts:84`  

## Steps

1. ✓ `app.open` `/e2e/content-editor.html` (436ms) — `e2e/content-editor/browser.e2e.ts:61`
2. ✓ `expect.toBeVisible` `getByLabel("原生正文")` (897ms) — `e2e/content-editor/browser.e2e.ts:63`
3. ✓ `locator.fill` `getByLabel("原生正文")` (199ms) — `e2e/content-editor/browser.e2e.ts:70`
4. ✓ `locator.focus` `getByLabel("原生正文")` (13ms) — `e2e/content-editor/native.ts:9`
5. ✓ `browser.keyboard.press` `Control+End` (6ms) — `e2e/content-editor/native.ts:10`
6. ✓ `browser.keyboard.press` `Enter` (11ms) — `e2e/content-editor/native.ts:11`
7. ✓ `browser.keyboard.press` `/` (128ms) — `e2e/content-editor/native.ts:13`
8. ✓ `browser.keyboard.type` `2 chars` (128ms) — `e2e/content-editor/native.ts:14`
9. ✓ `expect.toBeVisible` `getByRole("option", name: /^二级标题/).first()` (11ms) — `e2e/content-editor/native.ts:15`
10. ✓ `browser.keyboard.press` `Enter` (130ms) — `e2e/content-editor/native.ts:16`
11. ✓ `browser.keyboard.press` `Escape` (49ms) — `e2e/content-editor/browser.e2e.ts:72`
12. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (334ms) — `e2e/content-editor/browser.e2e.ts:73`
13. ✓ `browser.evaluate` `` (22ms) — `e2e/content-editor/browser.e2e.ts:74`
14. ✓ `locator.fill` `getByLabel("原生正文")` (107ms) — `e2e/content-editor/browser.e2e.ts:70`
15. ✓ `locator.tap` `locator("[aria-label=\"原生正文\"] .bn-trailing-block").last()` (86ms) — `e2e/content-editor/native.ts:7`
16. ✓ `browser.keyboard.press` `/` (86ms) — `e2e/content-editor/native.ts:13`
17. ✓ `browser.keyboard.type` `9 chars` (327ms) — `e2e/content-editor/native.ts:14`
18. ✓ `expect.toBeVisible` `getByRole("option", name: /^段落/).first()` (15ms) — `e2e/content-editor/native.ts:15`
19. ✓ `browser.keyboard.press` `Enter` (46ms) — `e2e/content-editor/native.ts:16`
20. ✓ `browser.keyboard.press` `Escape` (20ms) — `e2e/content-editor/browser.e2e.ts:72`
21. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (117ms) — `e2e/content-editor/browser.e2e.ts:73`
22. ✓ `browser.evaluate` `` (9ms) — `e2e/content-editor/browser.e2e.ts:74`
23. ✓ `locator.fill` `getByLabel("原生正文")` (57ms) — `e2e/content-editor/browser.e2e.ts:70`
24. ✓ `locator.focus` `getByLabel("原生正文")` (20ms) — `e2e/content-editor/native.ts:9`
25. ✓ `browser.keyboard.press` `Control+End` (8ms) — `e2e/content-editor/native.ts:10`
26. ✓ `browser.keyboard.press` `Enter` (27ms) — `e2e/content-editor/native.ts:11`
27. ✓ `browser.keyboard.press` `/` (73ms) — `e2e/content-editor/native.ts:13`
28. ✓ `browser.keyboard.type` `6 chars` (242ms) — `e2e/content-editor/native.ts:14`
29. ✓ `expect.toBeVisible` `getByRole("option", name: /^无序列表/).first()` (9ms) — `e2e/content-editor/native.ts:15`
30. ✓ `browser.keyboard.press` `Enter` (40ms) — `e2e/content-editor/native.ts:16`
31. ✓ `browser.keyboard.press` `Escape` (9ms) — `e2e/content-editor/browser.e2e.ts:72`
32. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (73ms) — `e2e/content-editor/browser.e2e.ts:73`
33. ✓ `browser.evaluate` `` (12ms) — `e2e/content-editor/browser.e2e.ts:74`
34. ✓ `locator.fill` `getByLabel("原生正文")` (57ms) — `e2e/content-editor/browser.e2e.ts:70`
35. ✓ `locator.tap` `locator("[aria-label=\"原生正文\"] .bn-trailing-block").last()` (98ms) — `e2e/content-editor/native.ts:7`
36. ✓ `browser.keyboard.press` `/` (79ms) — `e2e/content-editor/native.ts:13`
37. ✓ `browser.keyboard.type` `6 chars` (284ms) — `e2e/content-editor/native.ts:14`
38. ✓ `expect.toBeVisible` `getByRole("option", name: /^有序列表/).first()` (5ms) — `e2e/content-editor/native.ts:15`
39. ✓ `browser.keyboard.press` `Enter` (47ms) — `e2e/content-editor/native.ts:16`
40. ✓ `browser.keyboard.press` `Escape` (5ms) — `e2e/content-editor/browser.e2e.ts:72`
41. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (79ms) — `e2e/content-editor/browser.e2e.ts:73`
42. ✓ `browser.evaluate` `` (6ms) — `e2e/content-editor/browser.e2e.ts:74`
43. ✓ `locator.fill` `getByLabel("原生正文")` (65ms) — `e2e/content-editor/browser.e2e.ts:70`
44. ✓ `locator.tap` `locator("[aria-label=\"原生正文\"] .bn-trailing-block").last()` (98ms) — `e2e/content-editor/native.ts:7`
45. ✓ `browser.keyboard.press` `/` (106ms) — `e2e/content-editor/native.ts:13`
46. ✓ `browser.keyboard.type` `9 chars` (346ms) — `e2e/content-editor/native.ts:14`
47. ✓ `expect.toBeVisible` `getByRole("option", name: /^检查清单/).first()` (10ms) — `e2e/content-editor/native.ts:15`
48. ✓ `browser.keyboard.press` `Enter` (44ms) — `e2e/content-editor/native.ts:16`
49. ✓ `browser.keyboard.press` `Escape` (21ms) — `e2e/content-editor/browser.e2e.ts:72`
50. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (120ms) — `e2e/content-editor/browser.e2e.ts:73`
51. ✓ `browser.evaluate` `` (7ms) — `e2e/content-editor/browser.e2e.ts:74`
52. ✓ `locator.fill` `getByLabel("原生正文")` (108ms) — `e2e/content-editor/browser.e2e.ts:70`
53. ✓ `locator.tap` `locator("[aria-label=\"原生正文\"] .bn-trailing-block").last()` (47ms) — `e2e/content-editor/native.ts:7`
54. ✓ `browser.keyboard.press` `/` (63ms) — `e2e/content-editor/native.ts:13`
55. ✓ `browser.keyboard.type` `2 chars` (80ms) — `e2e/content-editor/native.ts:14`
56. ✓ `expect.toBeVisible` `getByRole("option", name: /^可折叠列表/).first()` (41ms) — `e2e/content-editor/native.ts:15`
57. ✓ `browser.keyboard.press` `Enter` (77ms) — `e2e/content-editor/native.ts:16`
58. ✓ `browser.keyboard.press` `Escape` (18ms) — `e2e/content-editor/browser.e2e.ts:72`
59. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (296ms) — `e2e/content-editor/browser.e2e.ts:73`
60. ✓ `browser.evaluate` `` (5ms) — `e2e/content-editor/browser.e2e.ts:74`
61. ✓ `locator.fill` `getByLabel("原生正文")` (51ms) — `e2e/content-editor/browser.e2e.ts:70`
62. ✓ `locator.tap` `locator("[aria-label=\"原生正文\"] .bn-trailing-block").last()` (74ms) — `e2e/content-editor/native.ts:7`
63. ✓ `browser.keyboard.press` `/` (73ms) — `e2e/content-editor/native.ts:13`
64. ✓ `browser.keyboard.type` `4 chars` (198ms) — `e2e/content-editor/native.ts:14`
65. ✓ `expect.toBeVisible` `getByRole("option", name: /^代码块/).first()` (49ms) — `e2e/content-editor/native.ts:15`
66. ✓ `browser.keyboard.press` `Enter` (74ms) — `e2e/content-editor/native.ts:16`
67. ✓ `browser.keyboard.press` `Escape` (37ms) — `e2e/content-editor/browser.e2e.ts:72`
68. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (124ms) — `e2e/content-editor/browser.e2e.ts:73`
69. ✓ `browser.evaluate` `` (8ms) — `e2e/content-editor/browser.e2e.ts:74`
70. ✓ `locator.fill` `getByLabel("原生正文")` (45ms) — `e2e/content-editor/browser.e2e.ts:70`
71. ✓ `locator.tap` `locator("[aria-label=\"原生正文\"] .bn-trailing-block").last()` (45ms) — `e2e/content-editor/native.ts:7`
72. ✓ `browser.keyboard.press` `/` (79ms) — `e2e/content-editor/native.ts:13`
73. ✓ `browser.keyboard.type` `5 chars` (201ms) — `e2e/content-editor/native.ts:14`
74. ✓ `expect.toBeVisible` `getByRole("option", name: /^引用/).first()` (24ms) — `e2e/content-editor/native.ts:15`
75. ✓ `browser.keyboard.press` `Enter` (62ms) — `e2e/content-editor/native.ts:16`
76. ✓ `browser.keyboard.press` `Escape` (15ms) — `e2e/content-editor/browser.e2e.ts:72`
77. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (124ms) — `e2e/content-editor/browser.e2e.ts:73`
78. ✓ `browser.evaluate` `` (7ms) — `e2e/content-editor/browser.e2e.ts:74`
79. ✓ `locator.fill` `getByLabel("原生正文")` (45ms) — `e2e/content-editor/browser.e2e.ts:70`
80. ✓ `locator.tap` `locator("[aria-label=\"原生正文\"] .bn-trailing-block").last()` (70ms) — `e2e/content-editor/native.ts:7`
81. ✓ `browser.keyboard.press` `/` (96ms) — `e2e/content-editor/native.ts:13`
82. ✓ `browser.keyboard.type` `5 chars` (233ms) — `e2e/content-editor/native.ts:14`
83. ✓ `expect.toBeVisible` `getByRole("option", name: /^表格/).first()` (12ms) — `e2e/content-editor/native.ts:15`
84. ✓ `browser.keyboard.press` `Enter` (41ms) — `e2e/content-editor/native.ts:16`
85. ✓ `browser.keyboard.press` `Escape` (5ms) — `e2e/content-editor/browser.e2e.ts:72`
86. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (72ms) — `e2e/content-editor/browser.e2e.ts:73`
87. ✓ `browser.evaluate` `` (3ms) — `e2e/content-editor/browser.e2e.ts:74`
88. ✓ `locator.fill` `getByLabel("原生正文")` (46ms) — `e2e/content-editor/browser.e2e.ts:70`
89. ✓ `locator.focus` `getByLabel("原生正文")` (14ms) — `e2e/content-editor/native.ts:9`
90. ✓ `browser.keyboard.press` `Control+End` (5ms) — `e2e/content-editor/native.ts:10`
91. ✓ `browser.keyboard.press` `Enter` (21ms) — `e2e/content-editor/native.ts:11`
92. ✓ `browser.keyboard.press` `/` (67ms) — `e2e/content-editor/native.ts:13`
93. ✓ `browser.keyboard.type` `5 chars` (264ms) — `e2e/content-editor/native.ts:14`
94. ✓ `expect.toBeVisible` `getByRole("option", name: /^图片/).first()` (10ms) — `e2e/content-editor/native.ts:15`
95. ✓ `browser.keyboard.press` `Enter` (100ms) — `e2e/content-editor/native.ts:16`
96. ✓ `browser.keyboard.press` `Escape` (25ms) — `e2e/content-editor/browser.e2e.ts:72`
97. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (92ms) — `e2e/content-editor/browser.e2e.ts:73`
98. ✓ `browser.evaluate` `` (4ms) — `e2e/content-editor/browser.e2e.ts:74`
99. ✓ `locator.fill` `getByLabel("原生正文")` (37ms) — `e2e/content-editor/browser.e2e.ts:70`
100. ✓ `locator.focus` `getByLabel("原生正文")` (23ms) — `e2e/content-editor/native.ts:9`
101. ✓ `browser.keyboard.press` `Control+End` (16ms) — `e2e/content-editor/native.ts:10`
102. ✓ `browser.keyboard.press` `Enter` (29ms) — `e2e/content-editor/native.ts:11`
103. ✓ `browser.keyboard.press` `/` (79ms) — `e2e/content-editor/native.ts:13`
104. ✓ `browser.keyboard.type` `5 chars` (196ms) — `e2e/content-editor/native.ts:14`
105. ✓ `expect.toBeVisible` `getByRole("option", name: /^音频/).first()` (16ms) — `e2e/content-editor/native.ts:15`
106. ✓ `browser.keyboard.press` `Enter` (63ms) — `e2e/content-editor/native.ts:16`
107. ✓ `browser.keyboard.press` `Escape` (16ms) — `e2e/content-editor/browser.e2e.ts:72`
108. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (117ms) — `e2e/content-editor/browser.e2e.ts:73`
109. ✓ `browser.evaluate` `` (6ms) — `e2e/content-editor/browser.e2e.ts:74`
110. ✓ `locator.fill` `getByLabel("原生正文")` (18ms) — `e2e/content-editor/browser.e2e.ts:70`
111. ✓ `locator.focus` `getByLabel("原生正文")` (23ms) — `e2e/content-editor/native.ts:9`
112. ✓ `browser.keyboard.press` `Control+End` (6ms) — `e2e/content-editor/native.ts:10`
113. ✓ `browser.keyboard.press` `Enter` (4ms) — `e2e/content-editor/native.ts:11`
114. ✓ `browser.keyboard.press` `/` (74ms) — `e2e/content-editor/native.ts:13`
115. ✓ `browser.keyboard.type` `5 chars` (202ms) — `e2e/content-editor/native.ts:14`
116. ✓ `expect.toBeVisible` `getByRole("option", name: /^视频/).first()` (11ms) — `e2e/content-editor/native.ts:15`
117. ✓ `browser.keyboard.press` `Enter` (60ms) — `e2e/content-editor/native.ts:16`
118. ✓ `browser.keyboard.press` `Escape` (17ms) — `e2e/content-editor/browser.e2e.ts:72`
119. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (84ms) — `e2e/content-editor/browser.e2e.ts:73`
120. ✓ `browser.evaluate` `` (3ms) — `e2e/content-editor/browser.e2e.ts:74`
121. ✓ `locator.fill` `getByLabel("原生正文")` (19ms) — `e2e/content-editor/browser.e2e.ts:70`
122. ✓ `locator.focus` `getByLabel("原生正文")` (44ms) — `e2e/content-editor/native.ts:9`
123. ✓ `browser.keyboard.press` `Control+End` (6ms) — `e2e/content-editor/native.ts:10`
124. ✓ `browser.keyboard.press` `Enter` (32ms) — `e2e/content-editor/native.ts:11`
125. ✓ `browser.keyboard.press` `/` (77ms) — `e2e/content-editor/native.ts:13`
126. ✓ `browser.keyboard.type` `4 chars` (131ms) — `e2e/content-editor/native.ts:14`
127. ✓ `expect.toBeVisible` `getByRole("option", name: /^文件/).first()` (9ms) — `e2e/content-editor/native.ts:15`
128. ✓ `browser.keyboard.press` `Enter` (70ms) — `e2e/content-editor/native.ts:16`
129. ✓ `browser.keyboard.press` `Escape` (23ms) — `e2e/content-editor/browser.e2e.ts:72`
130. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (122ms) — `e2e/content-editor/browser.e2e.ts:73`
131. ✓ `browser.evaluate` `` (6ms) — `e2e/content-editor/browser.e2e.ts:74`
132. ✓ `locator.fill` `getByLabel("原生正文")` (70ms) — `e2e/content-editor/browser.e2e.ts:70`
133. ✓ `locator.focus` `getByLabel("原生正文")` (18ms) — `e2e/content-editor/native.ts:9`
134. ✓ `browser.keyboard.press` `Control+End` (5ms) — `e2e/content-editor/native.ts:10`
135. ✓ `browser.keyboard.press` `Enter` (25ms) — `e2e/content-editor/native.ts:11`
136. ✓ `browser.keyboard.press` `/` (76ms) — `e2e/content-editor/native.ts:13`
137. ✓ `browser.keyboard.type` `7 chars` (354ms) — `e2e/content-editor/native.ts:14`
138. ✓ `expect.toBeVisible` `getByRole("option", name: /^分隔线/).first()` (6ms) — `e2e/content-editor/native.ts:15`
139. ✓ `browser.keyboard.press` `Enter` (48ms) — `e2e/content-editor/native.ts:16`
140. ✓ `browser.keyboard.press` `Escape` (5ms) — `e2e/content-editor/browser.e2e.ts:72`
141. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (98ms) — `e2e/content-editor/browser.e2e.ts:73`
142. ✓ `browser.evaluate` `` (14ms) — `e2e/content-editor/browser.e2e.ts:74`
143. ✓ `locator.fill` `getByLabel("原生正文")` (39ms) — `e2e/content-editor/browser.e2e.ts:70`
144. ✓ `locator.focus` `getByLabel("原生正文")` (23ms) — `e2e/content-editor/native.ts:9`
145. ✓ `browser.keyboard.press` `Control+End` (4ms) — `e2e/content-editor/native.ts:10`
146. ✓ `browser.keyboard.press` `Enter` (3ms) — `e2e/content-editor/native.ts:11`
147. ✓ `browser.keyboard.press` `/` (76ms) — `e2e/content-editor/native.ts:13`
148. ✓ `browser.keyboard.type` `2 chars` (90ms) — `e2e/content-editor/native.ts:14`
149. ✓ `expect.toBeVisible` `getByRole("option", name: /^块级公式/).first()` (27ms) — `e2e/content-editor/native.ts:15`
150. ✓ `browser.keyboard.press` `Enter` (144ms) — `e2e/content-editor/native.ts:16`
151. ✓ `browser.keyboard.press` `Escape` (16ms) — `e2e/content-editor/browser.e2e.ts:72`
152. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (192ms) — `e2e/content-editor/browser.e2e.ts:73`
153. ✓ `browser.evaluate` `` (5ms) — `e2e/content-editor/browser.e2e.ts:74`
154. ✓ `locator.fill` `getByLabel("原生正文")` (110ms) — `e2e/content-editor/browser.e2e.ts:70`
155. ✓ `locator.tap` `locator("[aria-label=\"原生正文\"] .bn-trailing-block").last()` (101ms) — `e2e/content-editor/native.ts:7`
156. ✓ `browser.keyboard.press` `/` (114ms) — `e2e/content-editor/native.ts:13`
157. ✓ `browser.keyboard.type` `7 chars` (311ms) — `e2e/content-editor/native.ts:14`
158. ✓ `expect.toBeVisible` `getByRole("option", name: /^图表/).first()` (10ms) — `e2e/content-editor/native.ts:15`
159. ✓ `browser.keyboard.press` `Enter` (115ms) — `e2e/content-editor/native.ts:16`
160. ✓ `browser.keyboard.press` `Escape` (33ms) — `e2e/content-editor/browser.e2e.ts:72`
161. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (170ms) — `e2e/content-editor/browser.e2e.ts:73`
162. ✓ `browser.evaluate` `` (5ms) — `e2e/content-editor/browser.e2e.ts:74`
163. ✓ `app.open` `/e2e/content-editor.html` (365ms) — `e2e/content-editor/browser.e2e.ts:77`
164. ✓ `locator.fill` `getByLabel("原生正文")` (767ms) — `e2e/content-editor/browser.e2e.ts:78`
165. ✓ `browser.keyboard.press` `Control+Alt+0` (23ms) — `e2e/content-editor/browser.e2e.ts:79`
166. ✓ `browser.keyboard.press` `Control+b` (106ms) — `e2e/content-editor/browser.e2e.ts:80`
167. ✓ `browser.keyboard.type` `4 chars` (57ms) — `e2e/content-editor/browser.e2e.ts:81`
168. ✓ `browser.keyboard.press` `Control+b` (7ms) — `e2e/content-editor/browser.e2e.ts:82`
169. ✓ `locator.tap` `getByRole("button", name: "保存并重新打开")` (120ms) — `e2e/content-editor/browser.e2e.ts:83`
170. ✓ `browser.evaluate` `` (6ms) — `e2e/content-editor/browser.e2e.ts:84`

## Screen at failure

URL: `http://127.0.0.1:5391/e2e/content-editor.html`  

The screen as the agent reads it, one node per line: `#id role "name" text="…" [states]`.

```text
# Screen at failure
url: http://127.0.0.1:5391/e2e/content-editor.html
revision: b1
viewport: 1440x1000
nodes: 9

#root document "Native content editor acceptance"
 #n77 main
  #n78 heading "官方原生编辑器 · 隔离 UI 验收"
  #n79 textbox "原生正文" value="原生粗体"
   #n80 heading "原生粗体"
  #n81 text="7 / 20,000"
  #n82 button "保存并重新打开" [focused]
  #n83 region "已保存文档"
   #n84 status "正在加载内容…"
```

## Evidence

- screenshot `.codex-tmp/content-boundary-final/artifacts/native/e2e_content-editor_browser.e2e.ts__all_2014_20default_20blocks_20and_20official_20free_20math_20and_20diagram_2-128a25db/default/attempt-0/screensho…`
- log `.codex-tmp/content-boundary-final/artifacts/native/e2e_content-editor_browser.e2e.ts__all_2014_20default_20blocks_20and_20official_20free_20math_20and_20diagram_2-128a25db/default/attempt-0/failure/s…`
- trace `.codex-tmp/content-boundary-final/artifacts/native/e2e_content-editor_browser.e2e.ts__all_2014_20default_20blocks_20and_20official_20free_20math_20and_20diagram_2-128a25db/default/attempt-0/trace/tra…`

<sub>e2e 0.17.0 · run `01a157a8-9674-7eea-a37d-161af37692e2` · the whole run is in `report.json`</sub>
