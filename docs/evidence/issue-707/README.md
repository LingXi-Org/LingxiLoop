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

独立页面局部检查已覆盖每页相机、重命名/删除/撤销、窄容器、名称冲突与焦点恢复；独立对象层已接入便签和绘图的局部编辑/保存/撤销及节点和世界坐标评论；来源全部自由对象、内部页面链接及跨页完整交互仍未完成，见 `source-design-pages.json`。最新真实性能诊断失败收据是 `performance/a0ee1b66-diagnostic.json`；没有合格完整样本。

脚本计量与撤销清理辅助回归见 `performance/measurement-helper-receipt.json`：排队脚本按 Chromium 实际网络起点匹配浏览器完成事件；并发歧义仍拒绝计量。撤销只在活动编辑区发送退出键，隐藏编辑器不触发工作区快捷键；真实失败收据保留可信按键及服务端状态，不包含文档正文。这些辅助检查没有产生性能样本，不能代替真实性能诊断。

当前截图目录包含 54 张来源图和 72 张原生/独立导出预览图；所有哈希见清单，局部历史截图不等于当前候选完整验收。

SVG 图片的本地字体使用 `--checks=svg-font`；失败重试与迟到源变化分别使用 `--checks=svg-font-error` / `--checks=svg-font-cancel`。原始 SVG 保持不变，包含文字的实际可见图形才加载字体工具，完成缓存有界；墨迹边界与某个字体匹配不等于全部视觉状态通过。

模块首次503恢复使用 `--checks=svg-font-module`，验证实际 ESM 缓存失败和新可信上下文重试；字体失败使用原入口。生产隔离导出故障回归为 `node scripts/native-export-fault-acceptance.mjs /tmp/export-faults.json`，它只使用固定夹具。

自由画布内容回归为 `--mode=design --checks=canvas-contents`，深色加 `--canvas-theme=dark`。验证长段中文便签背景自动增高/缩短、独立存储、共享撤销、自由绘图、节点及空白世界坐标评论、删除画板不删除自由内容。来源保存探针和已知缺口见 `source-design-annotations.json`；该局部状态截图尚未同态配对。

便签自然布局与世界相机修复：`functional/natural-layout-*.json` 覆盖中文、英文大写、制表符实际换行后的背景、Worker 边界及评论定位；这些只读测量不写入文档。布局测量缓存最多保留八个页面，每页限256条及512KiB依赖字符串；缩放及自动布局只影响视图。实际拖动后保留自然高度，1440→390→1440 及切走页面后修改负坐标对象不会改变已记忆世界视角。空画布可直接创建中文便签。浅深色流程及两种编辑器各 50 页回归已运行，均保留 47 个未编辑页面哈希。此证据不是完整视觉验收或真实性能通过。局部 23 项模型、布局、相机和中文文案回归通过，75 个原生编辑器文件 lint 通过；本地全量类型检查仍受官方 SDK 未安装阻塞。

07e33d30 真实性能诊断已完成但失败：Design 走完 50 页、三次真实输入和撤销，当前脚本计量完整；导出仍超时，后续服务退出。不能认定原始退出根因。随后对冻结代理的 Node 22 HTTPS/TCP 重置复现发现上传和响应流未处理错误，现以 pipeline 和双向取消修复；五种连接/压缩传输检查及九种新旧导出控件下载检查通过。固定阶段、错误码及已知脚本行可进入脱敏收据，不记录原始错误、地址、凭据或内容。计量工具回归通过不等于产品导出或性能合格。

独立审查 81487bee/a0ee1b66 复现两项 P2，见 `reviews/81487bee-a0ee1b66.json`。已修正无关页内编辑克隆造成的自然布局缓存丢失，以及公开来源校验接受额外冒号的问题；新增真实滚轮→切页→Agent 无关对象变更→返回的长便签可见性回归通过。现在缓存按稳定标识与精确布局依赖，保持八页、每页256项及512KiB依赖文本上限；文字、宽度及有效样式改变不会复用旧高度。此修复仍待冻结候选独立复审。a0ee1b66 owning CI（42151940784）web/server/integration 全绿，deploy 跳过；其真实性能诊断 42152419298 已启动，尚无合格结果。

内部页面链接已补中文“复制页面链接”菜单及快捷键。链接只含所属项目/会话/设计/页面稳定标识，不包含 grant 或内容；会话入口只读获取已有设计并匹配身份，不调用创建。刷新和登录返回保留同范围目标，切换范围移除；不存在页面回退首个页面并显示中文反馈。`functional/canvas-private-links.json` 实测真实剪贴板、非当前页面目标、刷新、快捷键及删除反馈；13 项链接/导航/中文文案与既有会话打开保护单元通过，83 文件 lint 通过，页面菜单现有完整受控流程通过。真实授权工作区端到端及候选独立审查尚待完成。

正常缓存淘汰的独立复验另发现 P2，见 `reviews/9f0c34f3.json`。保持八页预算，现以至多八个隐藏、不可交互且不进入可访问树的便签节点补测布局，专用标识避免影响选框和评论；绝对定位与实际画布一致，测量完成即卸载。弱映射只关联存活节点，超出依赖字符串预算的当前节点也不会反复补测。真实滚轮→九个其他画布→返回回归通过，探针峰值1（八个批次上限另有单元覆盖），长便签 y/height 恢复、保存高度832未变。26项模型/布局/中文文案定向回归、75文件lint、制表符评论/Worker、深色画布完整流程与两编辑器各50页/47哈希检查通过；本地全量类型仍因官方SDK缺失受阻，原生文件无类型错误。此候选仍待独立审查及 owning CI。0c37e5cc 页面链接的独立审查与 owning CI 已通过，其真实登录端到端验收仍未完成。

独立复审 f2a47f87 确认独立便签正常淘汰及24项离屏批处理已修复，但组合继承字体存在 P2，见 `reviews/f2a47f87.json`。现补测与缓存统一解析祖先继承字体、字重、斜体、字距和对齐，子节点显式值保持优先；只改父组合字体也使旧测量失效。`functional/natural-layout-inherited-eviction.json` 实测2000个字符、父组合等宽字体、存高832/实际高8463，访问九个其他画布后返回，位置和高度保持，探针峰值1且已卸载。27项模型/布局/中文文案单元、75文件lint及制表符评论/Worker回归通过；本地官方SDK类型阻塞仍在，原生文件无类型错误。f2a47f87 owning CI（42154589397）已绿，当前继承修复待独立候选复审。

4838051e 复审另确认合法继承字体关键字 P2；现在继承解析包含子节点和中间祖先的 inherit/unset，initial 及带引号的字体名保持本义。实际继承/重置两种长便签淘汰回归通过，位置与高度保持，存高未变；28 项定向单元和75文件lint通过。本候选仍待独立复审。来源字体公式与新建文字/旧版缺省标题的不同默认值已单独记录于 `source-design-annotations.json`，不把这项逆向记录误报为已实现。

aaa18b4c 独立复审确认关键字修复，另在 flex/grid 流式组合复现相对便签正文百分比高度造成的 P2。现在正文参与自然高度，补测复用实际 PageContent 和既有整组布局展开；普通便签仍八个一批，流式组合按已有不可分割单元补测，媒体/执行内容不加载，组合上下文版本改变则重新测量。实际 flex 缩宽120px与grid宽240px、滚动后及正常缓存淘汰返回均通过，原存高832不变，见 `functional/natural-layout-flex.json` 与 `natural-layout-grid.json`。29项定向单元、75文件lint与制表符评论/Worker通过。4838051e/aaa18b4c 的 Web CI 因测试 fontStyle 字符串推断错误失败；现已修正，当前本地原生文件无类型错误，但全量仍因官方SDK缺失受阻。此前文档中相应“无原生类型错误”的旧结论不成立，以失败日志和新候选CI为准。

a0ee1b66 真实性能诊断42152419298已失败并保留哈希核验收据：两服务全程ready、四个workbench模式50页及当前脚本计量通过，但完整冷启动导出超时、一次基线空浏览器PSS缺失及一次Design关闭回收超时。没有合格完整冷启动样本，未启动十组配对。导出根因尚未确认；需要增加固定类别的导出状态及导出后网络计量，不可只看此前稳定期网络数据。
