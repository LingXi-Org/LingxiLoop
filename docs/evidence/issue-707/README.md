# Native editor parity — issue 707

Reference: JimLiu/baoyu-design v2.8.0, `016b39d7fdcc30bfacee31ea5541498ac53921c6`.
Performance baseline: LingxiLoop `72162f582fe49e9cbdb03f760e29e3683f9c5c99`.

`source-inventory.json` pins the inspected JS/CSS/entry/font bytes and locates
reference feature symbols in the compressed distributions. Reference executable
files live only in the temporary analysis environment. They are not shipped.
The upstream NOTICE separates MIT local tooling from the reconstructed Anthropic
editors and icon fonts; the implementation uses the product's React runtime,
existing components and Lucide icons.

## Delivery boundary

Editor content is Chinese, with LingxiLoop identity. The surrounding workspace
is unchanged. Comments and Agent use existing product services. Public sharing,
LAN links and phone remotes have no native product service and have no controls,
placeholder components, unavailable labels or event handlers in the new UI.
Read-only and empty-selection states of supported editing controls remain valid.

## Checks and evidence

Record only commands actually executed against the candidate. The isolated UI
runner exercises real React, the shared reducer and Workers with a controlled
HTTP fixture; it does **not** qualify product authentication, PostgreSQL
persistence, actual Agent execution or full-product performance.

The cloud environment's `npm ci --ignore-scripts` failed with E401 downloading
`@lingxi-org/lingxios@4.0.0` from GitHub Packages. The frontend-only validation
installation is in `/tmp/lingxi-public-validation`: it uses the repository's
lockfile and omits only that inaccessible private dependency. No replacement
runtime, ambient type shim or fake package is installed in its place. Full
web/server typechecks that reach that package remain blocked until the official
dependency can be installed.

### Reproducible local editor diagnostics

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node --import tsx \
  scripts/native-editor-ui-acceptance.mjs --mode=both --checks=parity \
  --browser=/path/to/chromium --output=/tmp/lingxi-parity
```

Use `--checks=save` for composition, focused Ctrl+S, pending ACK, concurrent style
changes and durable fixture reload. Omit `--checks` for the 50-page regression.
Screenshots alone do not establish the specified 1 px / 0.5% source parity gate.

## Completion gates

- [ ] Every source feature/state in the parity matrix is implemented and checked.
- [ ] Matched source/candidate screenshots pass 1 px / 0.5% thresholds in all four sizes and both themes.
- [ ] Final-candidate editor, model, media and comment checks pass.
- [ ] Authenticated API/Agent/database integration passes with the official runtime.
- [ ] Ten AB/BA pairs per editor meet ≤5% regression and input p95 ≤100 ms.
- [ ] Independent read-only review of the final candidate is complete.

No production merge or deployment is included.


逐项跟踪见 [parity-matrix.json](parity-matrix.json)：当前 152 条初始控件/状态记录，均保留视觉与完整功能未通过标记；未列出的可达状态还须从源码及运行入口继续补齐。每项包含源码文案定义偏移、触发步骤、状态、原生位置、已有截图及局部功能证据。定义目录不等于可达性证明。

源码目录可复现：`node scripts/native-editor-source-census.mjs --reference-root=/absolute/pinned-checkout --output=/tmp/census`。固定哈希下识别 Design 2557、Slides 1697 条文案定义；包含依赖库，尚未全部完成入口归属。偏移单位明确为 UTF-16，不把第一次字符串命中误当组件位置。

[visual/manifest.json](visual/manifest.json) 绑定参考与原生截图、源码及夹具哈希；[visual/reference](visual/reference) 与 [visual/native](visual/native) 可直接并排审阅。原始差异报告不应用排除区，且明确 `qualified: false`。

表格插入与标题行诊断使用 `--mode=slides --checks=table`，字体诊断使用 `--checks=fonts`，并发选择冲突使用 `--checks=font-cas`。默认选项与产品文案为中文，文稿数据保留原文。字体许可与资源见 `third_party/editor-fonts/manifest.json`。网页、PDF 与演示文稿的局部结果见 `functional`；离线文件打开仍未验证。

Design 独立页面回归使用 `--mode=design --checks=canvas-pages`，深色增加 `--canvas-theme=dark`；并发重命名使用 `--checks=canvas-pages-cas`。来源先从固定版本创建单独的三画板临时项目，保留隐式默认页面，运行其原始入口，再以 `native-editor-reference-capture.mjs --reference-root=/absolute/pinned-checkout --pages-only=true --pages-url=http://127.0.0.1:PORT/design/TEMPORARY_SESSION/ --browser=/path/to/chromium --output=/tmp/reference-pages` 复现。它只编辑临时来源项目：新建一个页面及 800×600 空画板，捕获浅深两主题的菜单/动作/名称/删除确认，最后恢复第二页名称。已有第二页时名称须为 Page 2。发布包不进入产品。

独立页面局部检查已覆盖每页相机、重命名/删除/撤销、窄容器、名称冲突与焦点恢复；独立对象层已接入便签和绘图的局部编辑/保存/撤销及节点和世界坐标评论；来源全部自由对象、内部页面链接及跨页完整交互仍未完成，见 `source-design-pages.json`。最新真实性能诊断失败收据是 `performance/412ffc0d-diagnostic.json`；没有合格完整样本。

脚本计量与撤销清理辅助回归见 `performance/measurement-helper-receipt.json`：排队脚本按 Chromium 实际网络起点匹配浏览器完成事件；并发歧义仍拒绝计量。撤销只在活动编辑区发送退出键，隐藏编辑器不触发工作区快捷键；真实失败收据保留可信按键及服务端状态，不包含文档正文。这些辅助检查没有产生性能样本，不能代替真实性能诊断。

当前截图目录包含 54 张来源图和 72 张原生/独立导出预览图；所有哈希见清单，局部历史截图不等于当前候选完整验收。

SVG 图片的本地字体使用 `--checks=svg-font`；失败重试与迟到源变化分别使用 `--checks=svg-font-error` / `--checks=svg-font-cancel`。原始 SVG 保持不变，包含文字的实际可见图形才加载字体工具，完成缓存有界；墨迹边界与某个字体匹配不等于全部视觉状态通过。

模块首次503恢复使用 `--checks=svg-font-module`，验证实际 ESM 缓存失败和新可信上下文重试；字体失败使用原入口。生产隔离导出故障回归为 `node scripts/native-export-fault-acceptance.mjs /tmp/export-faults.json`，它只使用固定夹具。

自由画布内容回归为 `--mode=design --checks=canvas-contents`，深色加 `--canvas-theme=dark`。验证长段中文便签背景自动增高/缩短、独立存储、共享撤销、自由绘图、节点及空白世界坐标评论、删除画板不删除自由内容。来源保存探针和已知缺口见 `source-design-annotations.json`；该局部状态截图尚未同态配对。
