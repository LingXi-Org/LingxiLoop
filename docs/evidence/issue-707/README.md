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


逐项跟踪见 [parity-matrix.json](parity-matrix.json)：当前 155 条初始及增补控件/状态记录，均保留视觉与完整功能未通过标记；未列出的可达状态还须从源码及运行入口继续补齐。每项包含源码文案定义偏移、触发步骤、状态、原生位置、已有截图及局部功能证据。定义目录不等于可达性证明。

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

[Design播放菜单](functional/design-play-menu.json)已按固定源码纠正：先选画板再进入全窗口，保留交互原型／静态画板分组、阅读顺序与无框排除。
[固定来源与运行数据](source-design-playback.json)及八组参考/原生截图已保留；分组元数据进入兼容文档、转换和撤销/重做。
153条初始/增补清单仍未穷尽全部状态，各条完整功能与视觉资格继续保持未通过。
[bbb5d632复审](reviews/bbb5d632.json)无新P1/P2且正式CI通过，但性能诊断在工具栏几何前置检查失败，未产生新性能样本。

[画板表面与无损缩略图](functional/design-canvas-surfaces.json)：小图颜色从574/576像素改变恢复为0；标题控件按参考12px/16px修正，低缩放仍保留自然尺寸阴影。
四容器双主题局部几何通过，八组完整未掩码像素仍未过门槛；[来源](source-design-canvas-surfaces.json)及前后/叠加截图均保留。
[59be9a5a复审与CI](reviews/59be9a5a.json)确认无P1/P2且实际持久化回归通过；性能诊断仍在前置几何失败，补齐漏传的同环境参数后需新候选重跑。

[焦点与撤销回归](functional/focus-recovery.json)复现真实619×926容器中完成编辑后焦点丢失，ShiftTab额外滚动画布652px。
完成及ESC交还焦点后，140/154键盘撤销、图片和公式检查通过；独立画布编辑也保留参考的画板焦点描边。
[7af59176审查/运行](reviews/7af59176.json)记录正式CI与复审通过，但实际诊断在undo阶段失败，保留失败，不作为性能通过。


[Slides 转场局部回归](functional/slides-transitions.json)覆盖无／淡入淡出／推移／神奇移动、双向播放、复制配对、重开、撤销重做与减少动画；
[固定来源运行数据](source-slides-transitions.json)记录原版 320/420/480ms 及缓动、方向与位置关键帧。放映及动画代码按需加载，离线 HTML 不发外部请求并支持播放与打印全部页面。
[面板停靠来源](source-slides-inspector-layout.json)纠正窄屏关闭按钮被工具栏遮挡：768px以下采用 min(50%,384px) 底部面板，其上采用336px右侧面板。
155条清单均未获完整功能或视觉资格；完整演讲者视图、放映外观、PPTX转场及所有原版降级规则仍待完成。
[1b2366f4独立复审与CI](reviews/1b2366f4.json)确认无P1/P2、owning检查通过；该提交真实诊断仍运行中。


[af9ffa03独立审查](reviews/af9ffa03.json)确认4项P2，虽正式CI通过仍不能验收。
[先失败后修复的回归](functional/slides-transition-review-fixes.json)覆盖Tab绕过放映、普通复制配对碰撞、不同页尺寸、motionId共享逆操作，
并补非StrictMode焦点及离线隐藏页尺寸检查。普通对象复制生成新身份，整页复制保留配对；两页分别适配，Magic按目标局部坐标还原起始屏幕几何。
[可读参考包与实际PPTX导出](source-slides-readable-provenance.json)已核对固定提交blob哈希；原版PPTX省略转场且不另提示，不引入虚构的降级规则。
76项局部单测与140/154浏览器回归通过，新增数据库扩展、正式CI与修复候选独立复审待完成；全部155项完整资格仍false。


[3b967c6e复审](reviews/3b967c6e.json)确认原四个失败场景关闭，正式web/server/integration及首次motionId共享历史数据库回归通过，
但横竖页Magic起点仍被目标页双层裁切，不能验收。[实际像素回归](functional/slides-portrait-clipping.json)先观察到0文字像素，
只在不同宽高比的Magic过程中允许目标内容越过页面边界，舞台始终裁切，结束恢复页面边界；140/154的正反向实际文字均可见。
截图观察临时暂停动画并延长兜底清理，不作为动画时序或性能通过证据。新候选仍待CI及独立复审。

[1b2366f4真实诊断](performance/1b2366f4-diagnostic.json)已完成并保留原始脱敏ZIP及SHA256。候选两编辑器各50页遍历与六个50页导出通过，
六项基线导出超时照实保留。只有每编辑器/模式/侧1组，qualified=false；Slides单次冷启动增长约33.6%、增量PSS约16.7%、脚本约4.35%，
不能作为最终p75或十组交替性能通过。完整155项功能、视觉与最终性能资格继续未取得。

[ab0f6263独立审查](reviews/ab0f6263.json)确认新增纸张外未配对对象闪现，故上一候选未验收通过。
修复改为只让配对运动对象进入临时覆盖层，普通页面始终裁切；新回归同时观察动画中点纸张外实际像素和结束清理。
[最终受控像素回归](functional/slides-magic-clipping.json)在140/154均为纸张外0红像素，正反向标题可见且结束无覆盖层残留。

[8a1d134e复审](reviews/8a1d134e.json)关闭纸张外闪现但发现临时克隆冻结异步图片。
[异步内容回归](functional/slides-magic-live-content.json)验证140/154运动中的真实图片已解码、占位清除及退出清理；仍待新候选正式CI和独立复审。

[4a48187d复审](reviews/4a48187d.json)关闭图片问题，发现目标新增隔离内容重复执行。
[目标隔离单实例回归](functional/slides-magic-executable-target.json)通过140/154真实动画启动计数，目标含embed完整子树保持原位且不进入运动镜像。

[f22bd84b独立复审](reviews/f22bd84b.json)局部通过，正式CI42298755400 owning web/server/integration等通过，deploy跳过。
[原版演讲者窗口](source-slides-speaker.json)及[五尺寸截图叠加](functional/slides-speaker-raw-pixels.json)已归档。
原生窗口接入计时、导航、中文备注与等待复用，使用共享React与文档操作；可执行内容的预览只读取静态快照。
S29保留未取得资格：自动全屏与完整放映控件、全部视觉/媒体/错误状态仍待补齐；原始像素未掩盖中文或图标差异。

[9155122d独立审查](reviews/9155122d.json)发现两项备注恢复P2，虽正式CI通过仍未验收。
修复由主面板与讲者窗口共享本地草稿，直接呈现权限/冲突/网络失败与恢复动作；403拒绝后也能下载原队列，并显式重查权限后重试。
新候选待正式CI和独立复审，完整视觉、服务与最终性能门槛继续未取得。
[备注恢复定向收据](functional/slides-note-recovery.json)记录140/154权限、冲突、403队列恢复与幂等重试；主面板共享、组字关闭、相同远端值和只读重载导出也有受控回归。

[825b871e独立审查](reviews/825b871e.json)关闭原恢复问题但发现连续保存自冲突、旧显示覆盖远端两项P2；[CAS修复收据](functional/slides-notes-cas.json)保留先失败及140/154修复回归。825b871e正式CI42312565289通过，审查未通过，不能作完整验收。

[f14839da只读复审](reviews/f14839da.json)通过，正式CI42313201753通过。新[跳过页导出收据](functional/slides-skipped-export.json)覆盖140/154真实UI三格式下载、页数、备注排除、源快照不变；全部跳过时整份导出禁用，当前页图片仍可用。

[该提交性能诊断失败](performance/f14839da-diagnostic-failure.json)发生于测量前的导出检查，样本0；HTML属性顺序正则失效已改DOM读取，140/154生产构建五格式回归通过，需新候选正式重跑。

[40230749只读复审](reviews/40230749.json)及正式CI42314659698通过；[性能诊断42314734810](performance/40230749-diagnostic-failure.json)在测量前发现无法访问界面缺少无损重试的真实草稿恢复回归，样本0。恢复重试按钮，并保留下载/重载；既有钢笔、控制点及备注拒绝访问回归已重跑。


[放映控制条与全屏收据](functional/slides-presentation-controls.json)及[固定原版运行/样式参数](source-slides-presentation.json)覆盖自动全屏、延迟返回、窗口开关、左右导航、空闲隐藏、中文提示和键盘循环。页面只保留正常单背景，平移与缩放合到同一层，消除窄屏重复背景及分数裁切的差异；Magic期间保留独立背景。React开发记录器展开已关闭Window的真实异常已有先失败回归，改为组件间传递窗口取值函数后140/154通过。

[24对截图、叠加及原始差异](visual/slides-presentation/raw-pixel-results.json)使用同一文档语义哈希、四容器、浅/深及弹出讲者窗口/空闲/键盘焦点三个状态，均未排除中文、抗锯齿或图标，最大0.4773%，24/24低于0.5%。这是所列状态的局部像素证据，全部控件1px、媒体/备注停靠/链接/错误状态及完整155项仍未取得资格。

[8bfd13d9只读复审](reviews/8bfd13d9.json)通过；该提交[正式诊断42315857980](performance/8bfd13d9-diagnostic.json)成功，候选六次整稿导出通过；基线六次超时完整保留。每场景每版本仅一组样本，qualified=false，Slides启动和内存仍超预算；原始归档与哈希一并保留。它不是后续候选的最终性能资格。

[bc3716ac独立审查](reviews/bc3716ac.json)发现触摸/笔点击无法唤回隐藏控制条的P2；正式CI42318599525通过仍未验收。[可信指针修复收据](functional/slides-presentation-pointer.json)保留先失败，140/154触摸及笔输入翻页/唤回/退出均通过，鼠标键盘既有流程通过。

[42caf1d7独立复审](reviews/42caf1d7.json)通过，正式CI42319498417通过。[属性面板按需加载收据](functional/inspector-lazy.json)记录关闭前不请求模块、字段保存/共享撤销、失败后中文提示与焦点恢复、加载中关闭后不重开及缓存重入。源码拆分量不算实际传输或内存改善，仍待正式测量。

[a66a466b独立复审](reviews/a66a466b.json)及正式CI42321261657通过；[该提交诊断42324052948](performance/a66a466b-diagnostic-failure.json)在测量前因检查脚本未等待按需加载的面板完成而失败，样本0。等待条件已修复，140/154侧栏与140窄屏严格尺寸/过渡回归通过。

[代码声明来源运行证据](source-design-code.json)确认逐行CSS与属性格式、无效值恢复以及事件属性在提交时被拒绝。[原生数据基础收据](functional/code-foundation.json)记录解析、保存/重开、共享撤销重做、冲突保护、画布与缩略图绘制及导出声明。CSS与属性为可选字段，旧文件/历史不写回，不新增服务或表；代码和微调面板仍待接入，未把底层测试计作完整功能或视觉通过。

[62e247fb正式CI42325188407](https://github.com/LingXi-Org/LingxiLoop/actions/runs/42325188407)通过，但[独立审查](reviews/62e247fb.json)复现两项P2：原生几何被CSS覆盖、同值回退!important残留。[修复收据](functional/code-style-recovery.json)保留先失败及140/154双编辑器移动/撤销/并发与优先级清除结果。CSS选区从实际绘制局部框开始，几何写入在共享操作内同步已有声明及版本/逆操作；其余文档无需挂载额外测量节点。

[305ee089正式CI42326367476](https://github.com/LingXi-Org/LingxiLoop/actions/runs/42326367476)通过，但[独立复审](reviews/305ee089.json)确认首次拖动仍从原坐标起算；已补先失败并让首次拖动复用同一绘制框读取。140/154双编辑器拖动和共享撤销通过。[305诊断42326380804](performance/305ee089-diagnostic.json)成功，每场景一组且qualified=false；Slides冷启动+26.1%、增量PSS+21.9%，输入p95 31.2ms。六次候选整稿导出通过，基线超时保留；还不是最终候选资格。

[中文代码面板收据](functional/code-inspector.json)及[状态截图](visual/code-inspector/manifest.json)覆盖220ms应用/校验、连续聚焦保存、重开、无效格式恢复、事件属性拒绝、共有/混合声明、只读复制、中文组合事件、冲突恢复、权限丢失恢复、键盘选项卡、空选择、原生宽度与窄屏深色。代码只在Design显示，Slides固定来源仅有属性/主题。真实操作系统输入法未验证；截图选区不同，明确不算配对视觉通过。D20仍未取得完整功能或视觉资格。

权限丢失时已编辑操作复用既有会话恢复存储，不自动发送，不新增服务或表；会话重开后仍可备份，不会将旧草稿自动覆盖远端。源码、格式、错误、混合值与无障碍提示均中文；编程语法、品牌及作者原文保留。新增授权API/数据库集成用例待正式CI，本地web类型76、server类型748个私有SDK相关/级联错误，新改动模块无类型错误。

[09e95447正式CI42330654549](https://github.com/LingXi-Org/LingxiLoop/actions/runs/42330654549)通过，包含新增的真实PostgreSQL、授权与共享历史用例。[独立审查](reviews/09e95447.json)仍复现两项P2：可信组字期间访问丢失导致原始代码丢失、像素行高误成倍数。[修复收据](functional/code-composition-recovery.json)记录140/154可信compositionstart后无compositionend卸载、中文下载/重试/再次关闭重开/显式保存，以及2px实际行高/撤销重做/重开；不把CDP事件当真实操作系统输入法。原始草稿使用会话本地恢复数据，无自动发送，不新增服务或表。

[56af8a44正式CI42333439893](https://github.com/LingXi-Org/LingxiLoop/actions/runs/42333439893)通过；[复审](reviews/56af8a44.json)确认原组字丢失及像素行高P2关闭，但发现显式保留副本重载后局部输入复活。[清理修复收据](functional/code-explicit-reset.json)保留先失败、140/154真实下载/GET文档/清空字段与会话/关闭重开不复活，以及原有恢复不自动提交回归。


[0a622150独立复审](reviews/0a622150.json)通过，原显式清除后草稿复活P2已关闭；[正式CI42334223493](https://github.com/LingXi-Org/LingxiLoop/actions/runs/42334223493)通过。140/154备份并重载后字段与会话清空，关闭重开无复活；154原恢复与连续保存/共享撤销流程通过。局部复审不替代完整视觉、真实服务、操作系统输入法及最终性能资格。


[默认界面重新配对](visual/defaults-ready/manifest.json)修复参考截图提前捕获iframe加载占位的问题，等待每个可见画板以及Slides语义标题、图片解码和字体完成。140/154延迟挂载/图片/屏外占位回归通过；16对同环境截图、控件数据、叠加图和未掩码原始差异保留。仅1/16低于0.5%，最大4.684%，仍不满足视觉门槛；旧截图不能作为参考文档已绘制的证明。


[53126f83独立只读复审](reviews/53126f83.json)及[正式CI42334876269](https://github.com/LingXi-Org/LingxiLoop/actions/runs/42334876269)通过；复审独立校验70个文件哈希和16对原始像素计数，保持完整资格false。

[Slides工具栏几何修复](visual/slides-toolbar/manifest.json)先复现28px按钮被扩大为30px、窄屏纵向偏移4px、缩放槽与分隔间距不符。140/154四尺寸双主题局部尺寸/位置回归通过，154属性面板懒加载/保存/共享撤销和焦点回归通过，中文文案2项通过；8对未掩码像素仍超0.5%，不计为完整视觉资格。


[ee3cc009独立复审](reviews/ee3cc009.json)及[正式CI42335243473](https://github.com/LingXi-Org/LingxiLoop/actions/runs/42335243473)通过。两浏览器独立验证工具栏8组、属性开关与390/520/640/768/800/801/1024边界14组，含真实命中、横向滚动焦点、菜单和固定缩放槽。

[固定来源的声明语义](source-design-code-semantics.json)确认删除长度不再出现、非零无单位长度原样保存、全部参考iframe为标准模式。新[CSS值回归](functional/code-css-values.json)先复现长度改写、合法CSS被原生范围拒绝、重要声明丢失和无效替换残留旧值，再验证140/154保存/重开/共享撤销、零字号、优先级及浏览器解析离线声明。127项单测、15合约、中文文案和生产隔离五格式回归通过。

隔离页面原先缺doctype，导致BackCompat；已改为与产品及参考相同的CSS1Compat并加断言。[重新生成的16对默认截图](visual/defaults-standard-mode/manifest.json)全部保留原始像素，0/16达到0.5%，最大3.909%。历史defaults-ready与slides-toolbar比较存在文档模式差异，不能再作为同渲染模式证明；未改写历史截图或计数。标准模式下50页两编辑器均通过，47页哈希不变；其中组字为合成事件，不代表真实操作系统输入法。


[2c040116正式CI42336019559](https://github.com/LingXi-Org/LingxiLoop/actions/runs/42336019559)通过，但[独立复审](reviews/2c040116.json)确认无效背景色替换在导出中复活旧颜色P2，不能验收。[修复回归](functional/code-background-replacement.json)先失败后验证140/154画布/离线颜色一致、共享撤销重做及重开；生产隔离五格式重跑通过。


[dba7eee8独立冻结复审](reviews/dba7eee8.json)及[正式CI42336358638](https://github.com/LingXi-Org/LingxiLoop/actions/runs/42336358638)通过，背景导出P2关闭，17项导出测试通过。

[启动主线程探针](performance/startup-timeline-probe.json)在两个版本使用相同测量代码，记录可编辑前长任务和导航阶段，帮助解释Slides文档请求前的延迟。140/154真实定时任务、258条溢出保持256上限、可编辑后停止/释放、打开前过滤和数字字段导出检查通过；Python自检/15合约通过。尚未得到本候选真实产品样本，不能据此推断启动或内存改善，性能门槛未变。


[圆角持久化和导出](functional/page-radius.json)覆盖统一/逐角、共享历史、复制、缩略图、旧稿不变及五格式；218组原版归一化结果一致。`fac4d8d1`独立审查发现的预览方框与JPEG覆盖底色，在`db967385`已先补失败回归再修复，140/154正式回归、[冻结复审](reviews/db967385.json)及[owning CI](https://github.com/LingXi-Org/LingxiLoop/actions/runs/42348403596)通过。原始属性截图仍超像素门槛，完整画板表单和选择框待还原。

[真实系统拼音证据](functional/os-ime.json)及[候选框/重开截图](visual/os-ime/)补充了历史合成事件检查：Linux/X11/Fcitx5拼音、真实有界面Chromium140和156，在Design/Slides均验证组词期间不保存、选词一个共享批次、取消不误保存/不退出、重开保留。测试未调用CDP输入或派发组合事件；原始结束事件的isTrusted=false如实保留，可信汉字输入与真实候选框另有断言。使用`NATIVE_IME_BROWSER=<浏览器路径> bash scripts/native-editor-os-ime-check.sh <结果目录>`复现，依赖见现有手动验收工作流；容器测试配方见[记录](functional/os-ime.Dockerfile)。仅覆盖画布富文本，不代替其余输入位置/系统、真实授权API、完整视觉或最终十组性能资格。


[画板表单来源](source-design-artboard.json)区分打印分页和画板随内容增长。原版选择流式/A4不会改变1920×240画板或iframe高度；显式保存后写入print/paper。新增原生可选print独立字段，旧原生sizing/纸张PDF语义继续读取，不补写旧稿；新转换保留原版print而不误触发画板增长。

[局部回归](functional/design-artboard.json)记录140/154的打印/纸张保存重开、共享撤销重做、尺寸边界、适应内容高度及只读；18项真实临时PostgreSQL文档服务通过，不改旧快照。10492项原版纸张推断/页高断言一致；实际PDF经pdfinfo/pdftoppm验证流式A4两页、固定一页，保留第二页红色正文；纸张物理尺寸及链接缩放另有单测。新[八对默认画板截图](visual/design-artboard/geometry.json)登记控件最大偏差1CSSpx；[原始像素结果](visual/design-artboard/differences/raw-pixel-results.json)0/8通过，最大9.9872%，无掩码或抗锯齿排除。完整属性/参考线卡片、选框、其余状态及性能继续未取得资格。初始表新增D24–D27细分，现159行，均未标完整资格。


`658310ea`的[正式CI](https://github.com/LingXi-Org/LingxiLoop/actions/runs/42351895559)通过，独立[冻结审查](reviews/658310ea.json)仍发现三项高度适配P2，未验收。[修复回归](functional/design-artboard-fit-fixes.json)先失败后在140/154确认：重复三次不写历史、隐藏组合后代不撑大画板、普通高板不缩小、流式移除高度入口，并重跑主打印/共享历史及只读。来源四像素增长容差与入口资格进入纯函数对照；未将fill分页的缩小逻辑套到普通画板。完整视觉/全部属性和性能继续不合格。


[63096768冻结复审](reviews/63096768.json)及[正式CI42353417968](https://github.com/LingXi-Org/LingxiLoop/actions/runs/42353417968)通过，高度三P2闭合。[停靠面板局部修复](functional/design-panel-shadow.json)先复现原生多余外阴影，按来源none去除；四容器双主题通过。新[无掩码比较](visual/design-panel-shadow/differences/raw-pixel-results.json)仍0/8，768/390误差下降，最大8.4047%。另让纸张undo/redo测试等待真实响应和单选状态，保留此前首次时序失败。没有新增视觉资格。

画板变换新增取证与实现见 `source-design-board-transforms.json`、`functional/design-board-transforms.json` 及 `visual/design-board-transforms/manifest.json`。27个原版实际手势覆盖标题/八向手柄、Shift多选与角等比、Ctrl取消吸附、120–8000、复制追加及取消；限定纯几何9900断言一致。140/154各28项受控浏览器流程通过，包含属性草稿后缩放、评论实时定位、共享历史与重开；19项定向单元及中文文案检查通过。八个浅色配对状态的列明矩形最大偏差0.015748px，原始整图1.8161%–2.1261%、0/8通过，完整资格仍false。最小标题原多出89px已修复；等距分布、拖动中切换Alt、全部触摸/混合及四容器双主题仍待实现或验收。50页两模式各47哈希通过，精确时序范围和首轮失败均记录于收据。本地类型检查仍受正式SDK缺失阻塞。对照表增至162条，当前批次待正式CI及冻结只读审查。

Alt中途切换已补两原版实际手势及140/154各5项定向流程，见 `functional/design-board-alt-switch.json`；先复现副本框0!=1，再修正移动和鼠标释放时的实时修饰键。上一候选c9219138正式CI42358701444通过，冻结审查进行中。原版中间板等间距吸附x2080及红色160标注已单列D31（尚未实现），Source多选统一外框/属性空态仍在核对，均不计通过。对照表现163条，完整资格仍false。

c9219138冻结只读报告已归档 `reviews/c9219138.json`：正式CI全绿，但存在跨画布方向键P2，审查未通过。当前修复及140/154各6项定向回归见 `functional/design-board-scope.json`；切换清旧选区，键盘多选限定当前画布。154首轮多选取框null的取证时序失败保留，有限重取使用Playwright标准hover稳定性等待，复跑两模式多选及跨页通过；不以此声称全部Worker交互资格。

上述Alt/画布边界修复后，Chromium154全31场景通过；140已执行受影响6场景及稳定性重复。统一多选另有3项原版组缩放/Shift/最小值实际观测，见 `source-design-board-group.json`；成员边框1px、全组外框2px，普通和Shift缩放数据不同，当前仍列为未实现。

dd7672e9正式CI42360254895通过，独立复审 `reviews/dd7672e9.json` 确认跨画布P2关闭、140/154全31场景与19单元/5CAS通过，但发现静止切换Alt预览P2。修复先复现0!=1，再为活动手势增加统一修饰键监听与结束清理；两浏览器各6项包含静止120ms、继续移动、取消和历史的回归通过，见 `functional/design-board-alt-still.json`。仍不声称完整混合键或性能通过。统一多选的手动回归已复现外框0!=1，尚不纳入默认通过场景，后续实现。

统一多选现已实现，见 `functional/design-board-group.json`：成员1px、统一外框2px、组八向手柄及中文属性空态；未舍入组预览与按来源舍入成员分开，旧小数/越界和无边框维持来源数学。限定纯函数21420断言（原9900+组11520）一致；21定向单元、140/154各7组场景、154全部40场景及既有画板表单通过。三对浅色截图的列明矩形和边框另有实测，完整混合/触摸、四容器双主题及像素门槛仍false。上一提交8ce4802e CI42361301145与冻结复审通过，复审额外证实两浏览器监听生命周期正常；当前组候选待正式CI/独立审查。

D31等距已实现限定状态，见 `functional/design-board-spacing.json`、`source-design-board-spacing.json`：先复现2103!=2080，现匹配左右/垂直/延伸/取消吸附与160标注；回原位不写历史。红线覆盖蓝线，蓝线采用来源变换定位，叠层像素样本仅差1 RGB的抗锯齿。24定向单元、23220纯函数、154全47场景、140七等距场景、两深色状态与两编辑器50页/47哈希通过。七对1440浅深的标注框逐项零差、线/画板/标题最大0.014832px；原始整图1.8802%–2.4736%、0/7，无掩码，完整资格仍false。0f4f4090 CI42363183166与独立复审通过，报告另证实延迟正文和peer2400冲突原子性；当前等距候选待正式CI/冻结复审。


959b41b5等距候选的正式CI42365184280通过，冻结只读报告已归档 `reviews/959b41b5.json`，列明范围无新P1/P2。报告额外核对静止Ctrl/Meta/Shift/Alt、取消及权限变化后的标注清理。fontFamily字面不同，匹配描述仅指列明实测字段和几何，不宣称全部CSS一致。

画板标题原位重命名新增D32，见 `functional/design-board-title.json`、`source-design-board-title.json`、`visual/design-board-title/manifest.json`。先复现双击没有输入框；现支持全选、回车/失焦去空白保存、Esc取消、空白/同值零历史、共享历史和重开。中文无障碍名称、编辑时收起标题动作及原版浅深底色进入局部样式；沿用起始版本、草稿及冲突副本。140/154各12场景、154七项画板变换、31定向单元、140/156真实Linux拼音及既有两编辑器156文字输入回归通过。系统输入只用Fcitx5/xdotool，未派发composition事件；实际结束事件false照实保留。首轮X11窗口名称同步失败保留，改为带超时的同步搜索后通过。

本批12对截图包含四容器双主题及确认/取消前编辑状态；列明输入框矩形最大偏差0.011597px，字号/行高/内边距/圆角/前景和背景逐项比较。原始整图差异及逐张结果见manifest，未遮罩替换/抗锯齿区域，完整资格仍false。对照表164条仍未穷尽，标题全部工具/键盘/触摸和极端内容、真实授权评论/Agent全周期、全属性导出、10组AB/BA及整体验收待完成。本地lint43warnings/4infos；类型检查受正式SDK缺失及76项既有级联阻塞，不能记作通过。当前标题候选待正式CI和冻结只读复审。


3b907c45正式CI42366626619通过，但冻结只读审查 `reviews/3b907c45.json` 发现两项P2：Enter确认后BODY焦点导致原生局部CtrlZ失效；CtrlS提前提交/退出而固定原版保留输入。新增失败回归不手动focus，修复为键盘确认恢复标题焦点、普通blur保留点击目标、标题CtrlS保留草稿；140/154各7项及140/156真实系统输入法直接共享撤销重做通过，21定向单元/lint通过。来源撤销先核对DOM再显式保存文件，严格区分内存与落盘。首轮属性按钮名称误断言及Source落盘时机误断言均保留为探针修正，不作为产品缺陷。见 `functional/design-board-title-focus.json`、`source-design-board-title-keyboard.json`；新冻结候选待CI和复审，完整资格仍false。

真实授权服务另有正式CI证据 `functional/comments-authorized-ci-3b907c45.json`：PostgreSQL、签名会话网关、同源评论CRUD/解决重开/删除、无会话和项目/租户隔离、正式LingxiOS Worker、真实outbox投递与Agent回复持久化通过。外部模型/IM适配在该集成中使用受控服务，不能作为真实外部模型或浏览器端完整回路验收；Design独立Worker评论回路和全定位仍待验证。


元素链接新增D33，清单现165行，仍未穷尽。见 [源码及许可定位](source-element-link.json)、[功能收据](functional/element-link.json) 与 [截图及差异](visual/element-link/manifest.json)。按原版仅在Design增加目标属性；Slides沿用既有面板，验证已有行内链接编辑。中文网址、相对地址、邮件、电话、锚点、混合值取消、两种表示的版本依赖、权限恢复、共享历史与六格式实际下载均有局部证据。保留旧稿未完成网址、作者目标和文字颜色；缩略图装饰摘要剥离地址且有界。55项定向单元通过，140/154各22种场景、140/156真实系统拼音及既有文字/标题拼音回归通过；HTTP夹具不代表真实授权产品端到端。

四对1440截图的输入框横坐标、宽高一致；上方尺寸/布局控件尚缺，纵向相差241px，原始像素差5.0576%–9.1362%，0/4通过，没有掩码或抗锯齿排除。本批本地web lint保持43 warnings/4 infos，完整类型检查仍被正式SDK缺失及76项级联诊断阻塞，不能记作通过；冻结候选正式CI与独立审查待执行。225ef822本身的CI及独立审查已通过，见 [只读报告](reviews/225ef822.json)。

[225ef822性能前置失败](performance/diagnostic-225ef822-preflight.json)发生在正式测量前：侧栏宽度检查未等待ResizeObserver，Chrome140读取560而预期520。现检查等待实际aria-valuemax更新，保留原键盘/拖动/持久化断言；140记录560→520，154记录520→520。没有改产品逻辑或放宽阈值。该失败运行没有可用的生产性能数据，仍需冻结候选新诊断与至少10组交替AB/BA。

链接缩略图修改后，两编辑器各50页遍历、三页编辑重开、主题/排序/共享历史及47个未修改页面哈希回归均通过；Design最大挂载6页/22节点，Slides为1页/7节点，无控制台异常。仍为受控HTTP夹具，不能代替性能测量。


9fc38efe正式CI42375115877通过，但独立审查实测P2：整体和子文字链接生成嵌套a，离线HTML解析拆散组合、PDF丢失子地址、PPTX子命中区越出页面。见 [失败与修复收据](functional/element-link-nested.json)。修复使用独立锚点命中层并保留div容器，编辑时不遮挡子选择；140/154真实下载HTML再打开，组唯一且三成员、两种地址实际命中正确；PDF两URI及PPTX页内坐标通过。32项定向单元、154九种与140六种受影响UI回归通过；候选正式CI与冻结只读复审待执行。原候选失败仍记为失败。


5e97ffdc正式CI42375982697通过，独立复审在同一文字节点的整体+局部两目标发现新P2，报告 [5e97ffdc](reviews/5e97ffdc.json) 保留；[9fc38efe原报告](reviews/9fc38efe.json)同时归档。现在将局部行内锚点置于整体命中层上方，普通内容仍命中整体地址。见 [可信点击与实际导出](functional/element-link-same-node.json)：140/154的真实全窗口预览及离线HTML中，两个位置各实际鼠标点击isTrusted=true并命中各自地址；PDF两URI、PPTX页内坐标及154原组合回归通过，32项定向单元通过。没有把捕获防外跳当导航授权，也没有改变实际命中。待修复候选正式CI及独立复审，完整资格仍false。


bd29d74b正式CI42376765660和[冻结只读复审](reviews/bd29d74b.json)通过，两个链接P2均已关闭。完整资格仍未通过。9fc38efe[新性能前置失败](performance/diagnostic-9fc38efe-preflight.json)发生在生产测量前：普通标题被拉伸，实测524px对参考约64px。现仅编辑输入框使用剩余宽度，普通标题恢复自然宽度及参考颜色、4px圆角；没有放宽1px断言，反而补颜色/圆角检查。[局部回归](functional/design-board-label.json)含新固定来源28数学/8运行样本、140四容器双主题及154四改名场景；后者回车、取消、保存快捷键、历史及重开通过。

[标题默认态8对截图](visual/design-board-label/manifest.json)列明矩形最大差0.011597px，所列字体/颜色/圆角一致；全部原始整图差异0.7819%–3.2501%，0/8低于0.5%，没有掩码或抗锯齿排除。新冻结候选CI和只读审查待运行；失败诊断没有可用性能样本，最终10组AB/BA仍缺。


3ff1a0b6正式CI42377740762通过，但[独立审查](reviews/3ff1a0b6.json)在120px画板长标题复现64px最小宽度导致中心被裁、双击不开改名P2。固定Source精确规则是min(64px,100% + 1px)；现按公式夹取，并还原≤32px未选中透明、程序化焦点和选中恢复。见 [来源及回归](functional/design-board-label-range.json)：140/154宽窄长标题中心可信双击、取消零写入通过，140另有深色两种和默认8几何/样式回归；Source浅深两种均核12资源哈希，列明矩形max0.006104px、透明度/颜色/圆角一致。没有将程序化焦点检查算成Tab全流程。参考就绪助手固定Page 1名称导致的首轮探针超时保留，显式标题参数修正后通过；并未降低正文/图片/字体就绪要求。此修复待新冻结候选CI和独立复审，全部像素、功能及性能资格仍未通过。


35a4ca5a正式CI42379864110及[冻结只读审查](reviews/35a4ca5a.json)通过，原窄标题问题已关闭。审查仅覆盖该候选差异，不代表完整资格。

元素尺寸新增D34，清单现166项，仍未穷尽。见[固定来源定位及缺口](source-element-sizing.json)、[功能收据](functional/element-sizing.json)、[四对截图差异](visual/element-sizing/differences/raw-pixel-results.json)。画板DOM文字、图片和矩形支持宽高固定/自适应/填充、定位和附加尺寸；新增可选标记区分清除宽高与作者直接输入auto，沿用schemaVersion 1及共享版本/历史，没有新表。22种相同样稿的11项元素计算几何一致，140/154各28场景及4项手势、6种附加行零写入通过。真实Fcitx5拼音140/156、两编辑器六格式真实下载和重开解码、50页/47个未修改页哈希回归通过。PostgreSQL文档服务19项含新增自适应标记持久化、缩放撤销、复制及旧快照不可变通过；不是HTTP鉴权/浏览器Agent端到端。

保留失败证据：自动尺寸元素点击被旧几何覆盖，先复现1152px≠auto，再恢复已保存CSS及important优先级，点击/取消/缩放/撤销通过。老Design聚焦保存探针仍查找已经替换的高级入口而超时，单独记为未通过；没有将其他50页检查当作该检查通过。4对整图原始差4.4515%–4.7830%，0/4满足0.5%，没有掩码或抗锯齿排除；选择对齐栏32px、外边距行、多选、数值上下文菜单和缩略图几何等仍需还原。63项定向单元、web lint与server lint通过；本机完整类型检查仍76项SDK及级联诊断阻塞，正式候选CI和独立审查待执行。

[3ff1a0b6真实应用性能诊断](performance/diagnostic-3ff1a0b6.json)运行42377848714失败于实际测量步骤：8个样本4个通过，候选Design两种打开方式均在第二页公式不可见，不能纳入性能资格。候选Slides单次样本有冷可编辑时间、脚本传输及PSS增长超过5%的迹象，输入反馈35.9/39.4ms；单次不能代替最终p75/10组。导航器的窄标题提前停止问题在619px受控DOM复现，修正为两臂均完成既有坐标校准后再点击，保留全部图片/公式/字体就绪断言；140/154各619/1440宽、49页可信滚轮/点击回归及旧102用例通过，见performance/navigation-readiness-*.json。这仅验证导航器，仍需新冻结候选完整应用诊断，最终10组AB/BA尚未运行。


eec4f2a3正式CI42387679932全部通过，但[独立只读审查](reviews/eec4f2a3.json)实测新增P2：带themeFill的矩形输入百分比宽度后，原生画布变默认蓝而HTML导出保持主题红。140/154均复现，文档字段未被改坏。现直接在nativeStyle的主题解析结果中应用CSS矩形默认填充，取消原始样式的二次覆盖；见[失败及修复收据](functional/element-sizing-theme.json)。两浏览器各主题/自适应宽高三项、63单元、web lint和154两模式六格式复跑通过；原审查失败不改写。修复候选正式CI及冻结独立复审待执行。eec4f2a3新诊断42388191027已启动，仅诊断用途，不能代替最终候选或10组配对性能。


39654c0b正式CI42388593175及[独立只读复审](reviews/39654c0b.json)通过，CSS矩形主题P2关闭。独立复验还覆盖默认填充、渐变、描边/圆角/透明度、普通节点调用兼容和63单元；未据此扩大到完整服务或性能资格。eec4f2a3[Worker前置超时](performance/diagnostic-eec4f2a3-preflight.json)本机两浏览器5场景全通过，原因仍未知。39654c0b[后续前置失败](performance/diagnostic-39654c0b-preflight.json)已定位为新增导航检查在CHROMIUM_PATH初始化前执行，空参数导致spawn . EACCES；现将既有路径初始化移到步骤开头。两轮均未开始完整应用测量、零性能样本，未改任何计量逻辑/就绪断言/阈值，待新候选重跑。


97b1e086正式CI42389476451及[只读配置复审](reviews/97b1e086.json)通过，路径初始化顺序修正；[正式诊断42389503387](performance/diagnostic-97b1e086-preflight.json)进入后续UI前置，但在Design链接history的成功响应后即时DOM数量断言读取1而预期0。现等待相同链接DOM卸载，再保留原数量零、重做和重开断言；清除也使用同样的DOM就绪条件。见[定向回归](functional/link-history-dom-ready.json)：140/154各history/clear两项通过，明确root有后续对齐栏WIP，仍待精确冻结复审和完整诊断。没有改产品撤销或阈值，本轮未生产测量、零性能样本。

元素对齐新增D35，清单现167项，仍未穷尽。见[来源](source-element-alignment.json)、[功能收据](functional/element-alignment.json)和[八对叠加/差异](visual/element-alignment/differences/raw-pixel-results.json)。画板单个DOM元素使用六个对齐按钮和中文标签；居中保留双侧锚点与自动边距，属性输入读取作者偏移。流式元素垂直对齐正常禁用，相对定位先还原相对偏移。修复居中/右锚点拖动和缩放把绘制坐标写入作者偏移的问题，手柄只更新受控尺寸，保留另一轴自适应。全部写入沿用共享操作与冲突保护，没有新表或服务。

八种容器/主题的六控件边界偏差≤1 CSS px、颜色一致；13对状态的11项计算几何一致，包括在真实50%缩放下拖动来源元素的东侧手柄。56个受控HTTP原生场景与32个来源场景收据归档，140/154六向对齐共享撤销/重做及重开、左右拖动、居中/右侧缩放通过；154两项缩放取消和两浏览器拖动取消零写入通过。50项定向单元及15项CI编排契约通过。原始整图差3.0619%–13.7035%，0/8通过0.5%；没有掩码或抗锯齿排除。低于25%的手柄条件、多选约束、全部盒模型、缩略图和导出视觉仍有缺口，完整资格保持false。

本地lint通过（43 warnings/4 infos）；完整web测试290通过/7失败及typecheck的76项诊断涉及缺少精确私有LingxiOS依赖，不能报通过，将使用正式CI安装发布依赖验证。修复了本批测试中的两项类型收窄错误，最终原生变更无类型诊断。旧save测试改为现有画板标题行与宽度入口；140合成组词曾一次多写操作，逐事件复跑通过但首因未证实，保留失败记录。35451b5f正式CI42391937703和独立只读审查通过，报告[已归档](reviews/35451b5f.json)；其诊断42392081625已通过全部前置检查，实际完整应用测量仍执行中，不属于本批新候选的性能通过证据。本批候选尚待冻结CI及独立只读复审。

bcb2e6a1正式CI42398805173通过，但[独立审查](reviews/bcb2e6a1.json)发现右对齐→方向键→拖动锁定P2，两浏览器50%均复现，不能记为审查通过。修复键盘微移保留右/下锚点，居中微移保留两侧约束，不把拖动的轴锁定规则用于键盘；51定向单元和140/154各两条连续微移/拖动/重开通过，见[失败与修复收据](functional/element-alignment-nudge.json)。来源按钮焦点与实际点击h1后的键盘行为不同，最新参考收据保留其特殊行为，本项键盘一比一仍未完整验收。新修复候选待冻结CI和独立只读复审。

35451b5f完整诊断42392081625已完成，见[正式公开收据](performance/diagnostic-35451b5f.json)：8样本/6成功，diagnosticPassed=true、qualified=false；两基线完整导航各3项导出观察仍失败，未改状态。候选四种编辑器/打开路径的导航、输入与导出全部完成。单组Design完整导航/工作区启动分别-9.48%/-15.65%，脚本量+5.33%/+25.64%；Slides启动+30.27%/+43.72%，脚本量+5.22%/+9.77%，增量PSS+23.41%/+12.23%。候选输入p95为35.8–40.8ms。此结果明确未满足全部5%门槛，也不是最终10组AB/BA性能资格，后续按真实测量定位增长。

内外边距新增D36，清单现168项，仍未穷尽。[来源及兼容边界](source-element-layout.json)、[功能收据](functional/element-layout.json)、[八对叠加/差异](visual/element-layout/differences/raw-pixel-results.json)。中文布局区支持统一值、四边展开/还原、混合四边；展开零写入，内边距数字不小于0、外边距允许负值。统一修改清除旧轴/四边覆盖，沿用既有样式和CSS共享操作，无新字段或表。新内边距编辑显式内容盒，作者明确边框盒保留，旧稿未编辑的默认盒模型维持现状；因此不能把所有默认盒模型报成与来源一致。

140/154各17种局部功能状态、只读/权限变化/冲突/无效草稿恢复、共享历史与重开通过。8种容器/主题中6个输入框和2个展开按钮的边界均≤1 CSS px、颜色一致，含390容器的92px标签栏。20px内边距后50%真实手柄缩放：声明1192px、实际1232px，与来源一致；选择框/评论读取包含内边距和边框的实际尺寸，保留小数。81定向单元及23CI编排契约、两编辑器各50页/47未改页哈希通过，共用长度输入器140/156真实Fcitx5组词回归通过（目标仍为宽度中的中文样式注释，不冒充全部边距字段IME资格）。

Design两浏览器各六格式真实导出通过，[文件已归档](exports/element-layout/)；HTML独立重解析15字段，PDF独立栅格化后相对未加内边距页面横纵文字像素均偏移20px，PPTX包/媒体及三种图像尺寸/墨色通过。内容盒捕获先复现右/下透明出血变alpha255，修正克隆盒模型后alpha0，原透明出血及继承字色检查两模式通过；来源降级提示规则沿用，默认对象标识改用中文类型名称，保留作者自定义名称。PDF隐藏搜索文字层没有实际位置，未用其bbox冒充视觉。新夹具漏注册实时事件、导出漏预优化/逗号组合引发Vite导航、误用Design专用检查于Slides等失败原样保留并区分产品/探针原因；没有提高超时或放宽门槛。

8对原始整图差3.1184%–11.0870%，0/8通过0.5%；无掩码或抗锯齿排除。多选、全部CSS单位、数值上下文菜单/拖动、分组flex/grid完整布局、未编辑旧稿盒模型、全部变换及缩略图仍待逐项验收。lint通过（43 warnings/4 infos），本机完整typecheck仍有76项正式私有SDK缺失相关诊断、原生变更无诊断；未将其报为通过。本批尚待冻结CI和独立只读复审。前一e30bd25e正式CI42399923311及[独立复审](reviews/e30bd25e.json)通过，原方向键P2闭合；完整视觉、服务与最终性能仍false。

760ec84c正式CI42403446268通过，但[独立审查](reviews/760ec84c.json)发现锁定对象的只读边距字段仍可ArrowUp写入P2，140/154均复现，不能报独立审查通过。修复共用长度输入器的只读步进和新编辑，同时在只读保存/卸载保留先前草稿；布局提交复核最新锁定并沿用版本读键保护。两浏览器各4个锁定/既有草稿/权限变化/冲突回归通过；初始0→1失败和修复后的零写入、21草稿可恢复收据见[单独记录](functional/element-layout-readonly.json)。同时修正新文件末尾多余空行；不扩大全产品既有锁定策略。本修复候选尚待冻结CI及独立复审，完整资格仍false。

af2ae0e8正式CI42404271270及[独立只读复审](reviews/af2ae0e8.json)通过，锁定只读P2闭合；额外验证组合输入在他人锁定后仍可下载原文、没有新提交（CDP结束事件trusted=false，不冒充真实OSIME）。完整范围格式检查通过。后续[静态构建归属采集](performance/static-profile-plan.json)只在本任务分支的采集文件变化时运行：复用生产图审计，扣除预热应用块，输出项目模块/依赖包聚合长度和gzip估算，不含源代码或私有包内部文件名。固定72162f58与新候选各用自身锁文件/Node22构建；不新增服务、发布或部署，不改任何浏览器指标、5%门槛或AB/BA要求。真实数据待工作流，两个合成依赖图检查通过，不能把静态估算当作实际网络/Worker/PSS/启动已通过。

e3bc15de正常CI42404947387与静态构建采集42404943973通过，但[独立审查](reviews/e3bc15de.json)发现P3：预热根集合遗漏启动时实际加载、在vite中预加载的GlobalInteractionProvider。[首轮原数据](performance/static-profile-e3bc15de-incomplete.json)完整保留，qualified=false，不作为最终原生增量归属或性能证据。补全启动根并将应用/原生角色显式分组，移除按数组slice位置推断；新增对实际BOOT_ROUTE_MODULES的注册对应回归，先因遗漏失败，现3项通过。没有更改产品运行时代码、依赖、原图隔离断言或任何浏览器门槛。本次补根候选待冻结CI、重新采集及独立复审。

8ebdf7d1正常CI42405950324、补根重采42405945264与[独立复审](reviews/8ebdf7d1.json)通过，原P3闭合。[修正启动根后的数据](performance/static-profile-8ebdf7d1.json)仍qualified=false：基线静态原生闭包gzip155935/6块、候选604237/30块。这不等于实际新增网络字节，Design工作区先加载会话，路由动态预热与启动静态根不同。NativeEditor本体码元66892→176300是可定位的增长；候选闭包中出现ConversationThread/streamdown/parse5等，但只读项目导入遍历没有Native直接静态调用会话UI的路径，不能凭合并后的块名猜测消费者或删功能。名为Mermaid的块只是包装模块，也不能等同引擎已加载。补充逐块静态/动态边、动态入口标记、字节与第一方/依赖包归属，既有三项及新共置/边界数据检查共4项通过，真实补充采集待运行；不改运行时代码、分块策略或性能门槛。

387c018d正常CI42408450537、逐块生产采集42408446571及[静态复审](reviews/387c018d.json)通过。[实际元数据](performance/static-profile-387c018d.json)确认Native/RTE导入表含ConversationThread，但Rollup默认会展开传递依赖，尚不能用这条边证明直接消费。增加每静态边绑定数量和三个公开包lucide-react/zod/zustand的包内模块/渲染导出白名单；私包仍只有包级聚合，不输出内部路径、导出或源码。新增受控图先失败后通过，共5项；本次只补采集，运行时代码与分块策略未变，真实采集和冻结复审待执行。全部功能、视觉及10组性能资格仍未完成。

bb4107e1正常CI42409760818与[生产绑定元数据采集](performance/static-profile-bb4107e1.json)42409755975通过。Native→ConversationThread有2个绑定，RTE该边为0（传递展开），不能把两者同称直接消费。公开模块白名单确认Thread包含Bot/Image等32图标、Zod兼容IssueCode和两个Zustand shallow模块；具体共享消费者仍在只读核验，未改变运行时分块或宣布性能改善。

画板DOM元素补充[缩放手柄门槛](functional/selection-scale.json)：原版资源12项哈希核对，22.105%无手柄、25%出现命中区域；原生先在20%复现9个手柄，修正后140/154各50%→25%→20%→25%通过，低于门槛保留轮廓、零文档写入。10项文案/定位测试和lint通过。来源25%有10个命中区域，原生9个按钮，形态和整体视觉仍未完全还原。自由画布和Slides未改变；新候选CI和独立复审待运行。

[71个静态第一方文件的公开消费者核对](performance/shared-icon-consumers.json)确认Thread中32个Lucide模块与Native实际值导入严格交集仅Bot/Image，与实际2个绑定数量吻合；未发现Native使用Thread里的ZodIssueCode或shallow。现最小实验只将这两个公开leaf模块置于共享块，启用onlyExplicitManualChunks，保留原Lucide组件及共享React，不复制图标、不升级依赖。新增生产断言：共享块只能拥有这两个leaf，原生启动闭包不得含会话UI；真实旧bb数据复现断言失败、固定721数据通过。6采集测试和1定向映射测试、构建配置类型检查及lint通过。曾因构建配置TS默认lib不含replaceAll而报错，改用等价replace后实际重跑通过。本候选完整生产构建、原功能视觉和实际性能尚待验证，不能预报收益。

bb4107e1[冻结独立复审](reviews/bb4107e1.json)通过，5合成检查及额外白名单/隐私/旧字段不漂移核对通过。f4b79c47手柄门槛候选正常CI42410241340通过。低缩放修正也使旧缩放探针在22%下等待手柄30秒超时，保留失败后仅将4项实际使用手柄的旧探针默认通过菜单切50%；显式缩放参数优先，普通尺寸/视觉样稿不变。140/154各4旧场景+门槛新场景5/5、23CI编排契约通过，并将门槛检查接入既有真实应用前置检查，原手势/取消/重开/历史断言未删除。见functional/selection-scale.json。

da2552a6[真实生产采集](performance/static-profile-da2552a6.json)42410540031通过：Native/RTE均无Thread路径，两图标共享块903raw/444gzip且仅2leaf，原生静态gzip604237→378616（30→24块），不是实际网络收益。正常CI42410545786被下一推送取消，不记通过。独立[复审](reviews/da2552a6.json)无P1/P2但发现P3：构建指纹遗漏新配置helper。保留原数据及限定，新增实际配置导入覆盖测试先失败后通过，将helper纳入指纹；新候选须重采。

第二处实际共置为Native→protected-file-links两个绑定，对应[公开ChevronDown/MoreHorizontal消费者](performance/shared-preview-icon-consumers.json)，连带CodeBlock/streamdown/parse5；仅追加chevron-down/ellipsis两个leaf到同一共享块，未扩成57图标整包。生产审计检查4leaf且无React，并排除启动CodeBlock。对应映射及预览共置回归先失败后通过，现8采集+1映射、构建配置类型检查通过。f4手柄独立复审通过，bf实际应用诊断42410966590正在运行（两图标版本，指纹覆盖限定同da）；不是最终候选或10组资格。

6f71d610正常CI42411264924和[独立复审](reviews/6f71d610.json)通过，原指纹P3闭合；但[实际采集42411260291失败](performance/static-profile-6f71d610-failed.json)于新启动隔离断言：CodeBlock仍在原生闭包。只有基线元数据输出，四leaf后字节数和剩余消费者未知，不能写为隔离成功。现仅让断言抛出前输出既有白名单结构并标openingIsolationPassed=false，仍保留断言和失败退出，重采真实失败图后再定位。bf702aa5正常CI42410790800和[只读复审](reviews/bf702aa5.json)通过，实际诊断42410966590仍运行，不是最终资格。

02dc46c3正常CI42411895076通过，但[失败重采42411890483](performance/static-profile-02dc46c3-failed.json)仍命中CodeBlock，且致命退出前console.log异步写出被截断，候选JSON不能解析。没有补造数据或声称已取得完整失败图。真实子进程300000字符回归在旧实现复现JSON截断，改writeSync同步输出后9项采集检查通过，exit1及原异常保留。另补明确buildCompleted=false/sourceInputsUnchanged/固定failureCode；[独立复审](reviews/af4d6f05.json)已核02+af元数据口径及原错误rethrow。

复核[历史完整图的全部路径](performance/shared-transitive-icon-paths.json)证明：Native到CodeBlock有直接和经左右箭头包装块两条路径。前次仅处理直接边不充分。新增实际历史图传递路径回归先失败，再仅追加ChevronLeft/Right（总6leaf）通过，共2项映射/图回归；不扩55/57图标整组，避免已暖book-open/panel-right把成本前移。此次来源是已取得的历史完整图，不冒称6f/02精确新图。新候选真实生产消边、应用与原生总成本及完整性能待验证。

56d93aa1正常CI42412406893、[真实生产重采](performance/static-profile-56d93aa1.json)42412401607及[独立实际图核对](reviews/56-actual-graph.json)通过。六leaf共享块2009raw/604gzip，仅依赖既有createLucideIcon；React/ReactDOM模块仍唯一且8/8码元与基线一致。Native两根完整闭包无会话/代码预览/Markdown解析，未移入应用预热闭包。原生静态gzip228201，应用621256，联合849457；相对固定基线联合仍+74595（9.63%），不等于实际网络或性能通过。bf两图标诊断42410966590已完成前置，正在真实测量；56六图标诊断42412830772排队，均非最终10组资格。

新增D37画板文本对齐，清单现169项，仍未穷尽。见[固定来源](source-element-text-alignment.json)、[功能及缺口](functional/element-text-alignment.json)和[5对截图](visual/element-text-alignment/differences/raw-pixel-results.json)。先复现旧CSS居中覆盖导致点击右对齐仍居中，改为从实际CSS/父级读取，选择方向按来源替换旧声明并清除!important，还原删除作者声明并恢复继承；沿用共享操作/版本读键。四个中文单选、真实方向键、CSS优先级、逻辑start/end无选中、重开/历史、只读/锁定/权限撤回通过；140/154各12功能场景，154另4方向截图、深色及390窄容器3项。15定向单元、32CI/采集契约、两模式50页/47未改页哈希通过。整体类型检查仍76项SDK/级联诊断，新文件无诊断，不造桩。

文本轨道水平位置、203×24及相对单选框尺寸匹配，轨道/指示器采用实测浅深色；整组仍纵向提前21px，缺失对比度说明和其余文本行尚未还原。5对原始整图约3.98%–6.61%，0/5通过0.5%，没有掩码或抗锯齿排除。仅Design画板DOM，本批不声明Slides/自由画布、完整段落/表格/多选、六格式或真实服务资格。属性面板继续按需加载，局部CSS；无模型/接口/数据库变化。专用分支静态采集新增native路径触发，因真实历史已证明UI导入变化会重排共享块；不改变性能阈值。新候选正式CI、生产图及冻结复审待执行。

25d1c34f普通CI42416091825和生产审计工作流42416087606通过，但[独立审查](reviews/25d1c34f.json)实测P2：span文本单选聚焦后Delete冒泡，140/154均误删文字。原失败保留，不能以12常规场景/构建通过视为功能通过。现把radio/radiogroup加入现有按钮键盘边界；保存/共享历史仍在边界前处理。两版各23可信按键、Delete/Backspace/复制/组合/工具快捷键不改文档，保存/撤销/重做可用，回到画布复制/删除仍有效；绘图草稿和路径Delete回归通过。见functional/element-text-alignment-keyboard.json。修复候选新CI/冻结复审待执行。

25静态采集日志两行均短写至65565字符，虽然审计工作流通过，不能解析成完整两臂数据，见performance/static-profile-25d1c34f-log-incomplete.json。未下载原artifact或补造数据。实际阻塞stdout在初始化后单次writeSync可能只写部分；改为等待process.stdout.write回调后再正常结束/抛出原隔离错误，generateBundle异步等待。700000字符/延迟消费真实子进程在旧实现丢失输出、新实现完整且exit1，9采集及32组合契约通过。此前300k无阻塞验证不能冒称覆盖这种真实短写情况，原历史收据保留。该变更只作用构建采集，不改变产品、断言或浏览器预算。
