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

导出阻塞独立定位见 `reviews/a0ee1b66-capture.json`。与CI相同 Chromium140、213973字节正式运行时和第25页源，在离屏捕获帧内 dcReady 动画帧无法推进；四种原版启动/Trace对照均失败。透明视口帧可在1秒内生成非空PNG。当前修复仅使捕获帧进入视口且完全透明、inert、aria-hidden、tabIndex=-1，原opaque allow-scripts沙箱、授权和nonce/source/超时取消仍保留。新增真实客户端+正式运行时HTTP夹具回归：原布局真实失败，改后在140与154均完成640×360PNG、焦点保持、最多1帧、完成/取消后0帧、源文档不变；此回归不替代真实API或性能通过。见 `functional/opaque-capture-viewport.json`，工作流已加入。短命帧取消还复现CDP配置中会话消失回调异常；现在只在Target.getTargetInfo明确确认目标已消失时清理，仍存活或其他配置错误继续计入失败。真实140取消回归无回调异常，纯自检含存活目标拒绝，六种脚本计量及21项合同回归通过。194d46db owning CI42159661735全绿，已关闭先前Web测试字面量类型错误。

194d46db 独立审查复现多行网格位置丢失 P2，见 `reviews/194d46db.json`。现把实际局部位置及分数像素尺寸只读投影给 Worker，CSS和节点内容继续使用原稿尺寸，避免重复应用布局。两列四便签第二行滚动回归通过，原稿 x/y=0、宽240、高832保持，未产生保存请求；见 `functional/natural-layout-grid-row.json`。32项定向单元、75文件lint、单便签网格缓存淘汰和深色自由画布回归通过；两种编辑器各50页检查均保留47页哈希。完整本地类型检查仍受官方SDK缺失阻塞，完成日志未发现原生编辑器错误。本次候选待独立复审。隔离捕获修复8a4a2f29的owning CI42164001929已通过，独立审查无P1/P2；真实完整导出及性能仍未验收。

671166f5 独立审查确认第二行、旋转/翻转和分数像素修复，另复现混合网格的非便签节点在布局缓存失效后无法恢复，见 `reviews/671166f5.json`。现在整个流式单元参与补测，纯形状单元也恢复；缓存失效导致临时边界变小时，等待补测期间保留目标世界视角，用户滚轮/平移仍可接管。混合及纯形状三行网格切画布回归通过，原稿几何不变。

画布新建标题使用来源24号常规文字、内容宽度及默认2000px折行上限；旧版缺省标题保持72号粗体，显式maxW（含4000px）可读。可选textSizing与paddingX/paddingY进入共享校验、字段版本、复制、冲突、撤销及投影；旧文字未设置时保留固定尺寸。字号改变联动来源行高、内边距及字距，显式自定义值保留。双击后及拖动结束恢复声明布局，防止只读测量尺寸锁住后续内容。浅深色中文标题、字号联动/撤销、长标题保存重开及HTML实测宽高通过，见 `functional/canvas-title-*.json`。

生产构建的独立文字导出检查为 `PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node --import tsx scripts/native-canvas-text-export-check.mjs /tmp/text-export.json`；校验网页样式、便携文档签名、演示文稿实际XML内边距/行高/字距、矢量及双倍PNG尺寸/墨迹，并检查原稿、帧及DOM清理。演示文稿库数组内边距的实际顺序与其文档示例不一致，已按真实XML修正。140及154结果见 `functional/canvas-text-export-*.json`，此固定夹具不替代真实API、离线打开或视觉资格。140本机宿主字体异常及仅进程fontconfig对照见 `reviews/local-fontconfig-control.json`；排除宿主系统WOFF2后默认字体测量和PNG恢复，不修改产品或系统。显式思源黑体在本机140的网页字体NetworkError仍待定位，不能与该系统字体原因合并。

本轮35项聚焦单元、77文件lint、两种编辑器各50页/47页哈希、深色自由画布回归通过；完整本地类型仍受官方SDK缺失阻塞，完成日志中原生/共享模型无类型错误。本候选尚待独立审查及owning CI。真实诊断42164941507固定671166f5执行中，不属于新候选通过证据。

2e17fbb0 owning CI42168211101全绿；独立审查通过混合/纯形状网格、深滚视角、标题及五种导出，另发现统一内边距与横纵字段优先级造成重开外观变化，见 `reviews/2e17fbb0.json`。现统一内边距动作显式更新两个轴，原生/网页/演示文稿共用一次最终内边距解析，不再受DOM更新历史影响；不同轴显示中文“混合”。先前真实回归失败，修复后浅深色设置30→保存→重开→HTML一致，生产140实际PPTX四边也均为30对应的点值，五种导出及清理通过。30项聚焦单元、75文件lint、深色自由画布及两50页/47哈希回归通过；完成类型日志无原生/共享错误，全量仍缺官方SDK。新候选待复审和CI。显式思源黑体在同一进程fontconfig修正后也五种生产导出通过，见 `functional/canvas-text-export-noto-140.json`；历史网页字体错误不再作为当前失败门槛，仍不推断正式CI根因。

4931ab86 owning CI42169464212已绿；独立复审确认统一30修复，另发现显式14/11碰巧等于来源指标时被字号联动覆盖，见 `reviews/4931ab86.json`。现尊重已有统一内边距的显式自定义，保留两轴；初始来源指标仍可联动，不新增字段。先新增单元/真实UI回归并观察失败，修复后14浅色和11深色在字号24→72、保存重开及HTML导出中均保持。29项聚焦单元、75文件lint通过；全量类型缺官方SDK但完成日志中原生/共享无错。此候选待独立复审与owning CI。

钢笔逐点创建见 [source-design-vector.json](source-design-vector.json) 与
[局部结果](functional/canvas-vector-receipt.json)。`--checks=canvas-vector`
复跑15个实际源码交互案例；深色增加 `--canvas-theme=dark`。
`--checks=canvas-vector-load` 验证按需加载失败后的中文提示、编辑器保留和刷新恢复。
纯数学对照可复现：`node --import tsx scripts/native-canvas-vector-oracle.mjs /path/to/pinned/index-CYLuwRoc.js /tmp/vector-oracle.json`。
该脚本先校验固定哈希，只在参考环境执行原版纯函数，不进入产品包。
控制点编辑与完整同态视觉尚未通过，D10继续保留未完成标记。

`f3b28ddf` 独立审查发现的三项P2及修正局部结果分别见
[审查](reviews/f3b28ddf.json)、[草稿恢复与平移回归](functional/canvas-vector-retention.json)。
复现命令使用 `--mode=design --checks=canvas-vector-retention`；覆盖只读切工具、
403自动卸载、跨画布隔离、Space和中键实际平移。恢复副本包含未提交控制点及其原始基线。

4ab的真实失败归档已登记于 [性能收据](performance/4abf9704-receipt.json)，
包括实际50页PPTX下载后因PSS不完整而失败的记录；历史资格不重分类。
计量修正的局部结果见 [Worker/进程收据](functional/measurement-clock-pss-receipt.json)。
新增原始启动浏览器检查 `python scripts/native-artifact-worker-clock-check.py --browser=/path/to/pinned/chromium`
和真实进程检查 `python scripts/native-artifact-pss-check.py`，仍不产生合格性能样本。
后续诊断只读取现有图片元素并报告自然尺寸面积、缩略图数量和进程角色；这些计数不能直接等同于位图缓存占用。

控制点编辑新增对照见 [source-design-vector-edit.json](source-design-vector-edit.json)。
原版实测确认，逐点绘制结束后仍使用钢笔，切换选择工具后双击路径或按回车进入控制点编辑；
此前“完成后进入控制点编辑”的描述不能作为原版自动进入的依据。
局部回归包含锚点和切线、对称切线拉出、断开、角度约束、插点、删除、制表键、
连续微调、取消、编辑中保存及共享撤销重做；使用 `--checks=canvas-vector-edit`。
变换冲突、父组合移动及下载后重新载入使用 `--checks=canvas-vector-edit-cas`，
权限与平移使用 `--checks=canvas-vector-edit-retention`，工具按需加载失败使用 `--checks=canvas-vector-edit-load`。
纯数学可复现：`node --import tsx scripts/native-canvas-vector-edit-oracle.mjs /path/to/pinned/index-CYLuwRoc.js /tmp/vector-edit-oracle.json`。
这些记录不能替代完整菜单、相同完整文档的四尺寸双主题视觉、真实授权服务和性能门槛。

计量修正的独立审查见 [bc751dc3](reviews/bc751dc3.json)。
[该冻结提交的真实诊断](performance/bc751dc3-receipt.json)失败：Design 遍历脚本旧坐标未包含新增平移留白，
无法定位第二个画板；Slides 的 50 页及三格式导出通过，但冷启动和内存仍超目标。
这是历史单轮诊断，未重新归类失败样本，也不作为当前未提交实现的性能通过证据。

`7f8aa377` 的 [独立审查](reviews/7f8aa377.json) 发现父组合变换后取消导致下一次编辑改动未选点、
以及合法内边距导致进入编辑时路径跳位两项 P2。新增回归先失败复现，随后修正取消基线和内容区域映射；
并发及几何场景扩为 12 项，聚焦单元扩为 65 项。浅深各 17 项、恢复 5 项及含内边距编辑路径的五格式
生产隔离导出复跑通过，仍等待新冻结提交独立复审。`7f8aa377` 的 owning CI 42220163887 通过。

Design 性能遍历改为从实际已挂载画板的 CSS 位置校准世界偏移，继续使用可信滚轮和画板按钮，
不写入产品滚动/文档状态。`python scripts/native-artifact-navigation-check.py` 验证含留白的虚拟画板
与无新元数据的冻结基线，各遍历 50 页并返回第一页；Chrome 140/154 各 102 项通过。
[收据](performance/navigation-padding-receipt.json)只证明工具回归，不是性能通过证据。

[557e0bba 独立复审](reviews/557e0bba.json) 已关闭取消和内边距两项 P2，未发现新增 P1/P2；
owning CI 42222584755 通过，部署跳过。该冻结提交的真实诊断 42222610717 已完成，见下文；未代表后续实现通过。

[适配相机来源](source-design-fit-camera.json) 与 [局部结果](functional/canvas-fit-receipt.json)
使用相同三画板、相同钢笔路径、四尺寸双主题；补齐了此前参考文档包含其他注释的问题。
28 个固定源码数学样本和实际位置对照明确发现原生纵向偏移约 4.64px；修正后八组控制点及画板
位置/尺寸均在 1px 内，同缩放下平移后适配恢复也通过。70 个聚焦单元及原有局部流程回归通过。
[未掩码的像素差异](visual/fit-camera/raw-pixel-results.json) 八组仍全部未通过，保留了叠加图与差异图；
相机位置通过不能当作完整视觉通过。字体、工具栏、画板标题与边框还需继续校准。

可复现命令：
`node --import tsx scripts/native-canvas-fit-oracle.mjs --reference-root=/path/to/pinned/release --output=/tmp/fit-reference --capture=true --browser=/path/to/chromium`。
该命令在独立临时项目运行原版，等待三画板正文、字体和图片就绪，只写无签名地址的指标及截图。
原生对应使用 `--checks=canvas-vector-edit --vector-case=initial --point-matched=true --source-camera=true`
并指定 `--width`、`--height`、`--canvas-theme`。


[88c10856 独立审查](reviews/88c10856.json) 发现首次切入未加载画布内容时缓存空投影视角的 P2。
先用延迟接口复现“内容返回后仍空白”，再将首次适配延后到真实内容加载；尚未适配的临时视角不进入缓存。
[三场景局部回归](functional/canvas-fit-body.json)在 Chrome 140/154 均通过：等待加载、加载中切回及平移后的视角恢复。
原页面、链接、非原点画板和同文档相机流程、70项聚焦单元复跑通过。等待新的冻结提交独立复审。

[557e0bba 真实诊断](performance/557e0bba-receipt.json)完成：候选 Design/Slides 均真实遍历50页，
HTML/PDF/PPTX 各50页导出均通过；冻结基线的六项已知导出超时保留失败，未重写结果。
这仍只有每种编辑器一组冷样本和一组工作区样本，不满足十组门槛；Slides 冷启动约增42.6%、增量PSS约增25.2%，
仍需定位修正。完整视觉、真实性能及最终候选均未验收通过。


[93591a15 独立复审](reviews/93591a15.json)关闭稀疏投影视角 P2，未发现新增P1/P2。
[工具栏来源](source-design-toolbar.json)记录原版100%缩放读数预留、外框阴影/圆角、控件字号及分隔线，
并单独登记中文页名与删除分享入口的正常重排。新增位置断言先失败，修正后
[四尺寸双主题几何](functional/design-toolbar.json)均在1px内；原页面菜单流程、70单元及聚焦lint通过。
[未掩码像素差异](visual/toolbar/raw-pixel-results.json)改善到0.798%/0.673%、0.991%/0.870%、
2.608%/2.516%、2.457%/2.272%（按1920、1440、768、390浅/深），八组仍全部超0.5%。
参考截图沿用visual/fit-camera/reference，没有放大登记替换区域去掩盖其他差异；这不是完整视觉通过。


[ee844146 独立复审](reviews/ee844146.json)未发现新P1/P2，owning CI 42240544136通过。
旧Design窄宽入口的公式前置等待、interactions过期“历史记录”标签仍失败，未当作通过证据。

[画板全窗口预览来源](source-design-board-preview.json)记录固定版本四尺寸双主题、800×600小画板、
单选组键盘行为、重新进入默认适应、单板导出命名及六组画板阅读顺序。
原生新增画板标题动作、按需全窗口预览、原始CSS像素填满与最多1倍适应；返回和Escape保留原画布相机。
复用原生渲染、可见区域Worker、评论及版本服务；评论跟随预览坐标，远端删除退出并回焦编辑器。
单画板导出支持一倍/双倍位图、一页便携文档和独立网页压缩包；Design PDF按源码阅读顺序导出，不改原文档。
JSZip沿用锁文件3.10.1，仅在隔离导出环境按需加载，MIT署名已保留。没有分发上游运行时或私有图标字体。

[局部功能结果](functional/design-board-preview.json)覆盖四尺寸双主题、小画板、只读、延迟页面、远端删除、
模块失败恢复、评论与键盘单选组；Chrome140补跑评论和模块失败。真实浏览器检查一倍/双倍PNG尺寸、
一页PDF及只包含当前画板的HTML压缩包通过；88项聚焦单元、10文件lint通过。
原两模式评论、两模式各50页与47页未修改哈希复跑通过。本地typecheck仍有76项私有SDK缺失及级联错误，原生/共享零错误。

全窗口[适应](visual/board-preview/fit/difference/raw-pixel-results.json)八组原始像素仍超0.5%；
[填满](visual/board-preview/fill/difference/raw-pixel-results.json)六组原始像素在0.5%内，390两组仍超限。
未掩码、未剔除抗锯齿，保留原版分享入口及英文Fill/Fit与原生已登记替换的差异；不作为完整视觉通过。
复杂响应式body样式、滚动、全部快捷键和正常动画仍待继续核对。

参考可复现：原相机oracle命令增加 `--capture=true --board-preview=true`，资源哈希全部校验；
原生使用 `--checks=canvas-board-preview --preview-page=1` 对照同一完整文档和同一画板。


[d6071707 独立审查](reviews/d6071707.json)发现三项P2：预览CtrlS未进入保存重试、Tab到外层根节点可撤销文档、
模块尚未加载时Escape无法退出。新增回归先复现，随后转接已有保存链路、保护根节点编辑/粘贴事件、移除其Tab入口，
并提供轻量可取消加载外框，关闭后忽略晚到模块。[Chrome140/154各三项回归](functional/design-board-preview-review-fixes.json)通过，
保留评论等独立边界及原有草稿/冲突保护。等待新冻结提交独立复审。
该提交CI 42257955030失败在分组依赖清单一致性检查，构建及后续检查跳过；已按根锁文件补齐生成清单并通过局部检查。

[86c9c3d1复审](reviews/86c9c3d1.json)确认正式CI通过及前三项修正，另发现预览评论输入原生编辑被拦截。
[新增回归与图片请求诊断](functional/asset-reads-and-comment-input.json)先复现再修复；进行中的同图请求由4次降至1次。
这仅是功能诊断，完整视觉、真实授权服务及最终十组性能门槛仍未通过。
