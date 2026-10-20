# #214–#219 最小行动矩阵

2026-10-20。源码基线：`/workspace/LingxiLoop-maintenance-host-source`，候选 **`9a5cfda82ad105d666bf0452df1d615daf6c6a28`**。精确启动/选跑命令见 `/tmp/remaining-browser-minimal-handoff.md` 的 A/B/C。本次只读整理；未改源码、运行浏览器、调用生产 API/provider 或触碰固定 3.5.3 观察。#213/#215 已 closed，无需复开或重做验收；PR239 发布由 root 继续。

| Issue / 建议分配 | 已知实际缺陷或未完成工作 | 必要基础短测缺口 | 外部限制（不是产品通过证据） | 最小动作 | 现有证据 | 何时可关 |
|---|---|---|---|---|---|---|
| **#214 → 浏览器 A** | 未发现新增产品功能红例；流式样式和生命周期实现已上线。 | 原生减少动画 JS+CSS；实际官网动态对照。现有 `matchMedia` stub 只验队列。 | 官网 `ERR_CERT_AUTHORITY_INVALID`；原生独立 Chromium 曾 `No usable sandbox`。引擎0.12没有公开 media option。 | 官方 connect 接入正常沙箱且配置原生媒体的浏览器，新增 **1例** JS+CSS前置＋突发完整输出/光标收尾；官网 **1例**真实 replay/截图与已有产品同输入录像对照。无后端/provider重跑。 | `docs/evidence/issue-214/integrated/README.md`；`docs/evidence/release-215-216-219/formal358/pr234-review/REVIEW.md`；`e2e/web/streaming-text{,-official}.e2e.ts`。精确命令：handoff **A**。 | 两个基础验收有成功产物，或明确现场环境不可用并把具体未完成验收转到有负责人的关联任务、按交付范围说明关闭；不能写“官网/原生媒体已通过”。不追加长期 soak、全provider矩阵。 |
| **#216 → root 既有公开维护入口，禁止并发另一迁移者** | **最新生产只读结果非零：25条旧连续性候选需 native 授权判定；40条 active 记录无当前版本索引。** 是待收口的内容资格/索引维护工作，不是DDL未部署。25不等于25条全部可迁移；两数不应相加成独立65条。 | 生产当前授权下逐页处理及前后计数/原因/游标回执。 | 已有身份与当前授权限制必须保留；不能新建身份、复制凭据或用schema47/48替代内容回填。 | root 继续 `memory:maintain`→公开 `memory.migrateLegacy` / `memory.reindex`，先 native eligibility，符合项有界迁移/索引，不符合项给明确隔离/跳过原因；保存剩余数量及当前版本计数。**本表不执行该动作，不写0。** | 父线程最新生产计数 **25/40**（父线程正在生成正式回执，当前未提供其文件路径）；`server/src/bin/memory-maintenance.ts`；`docs/evidence/issue216-independent-restore/README.md`；`docs/evidence/issue-216/README.md`。 | 符合项完成；不符合项有授权/隔离原因；当前版本索引覆盖及残余原因可复核。可保留合法隔离记录，不能要求越权“清零”。无需复做结构迁移/全部发布。 |
| **#217 → UI权限/设备小验收 + 独立生成质量负责人** | **真实内容错误已存在**：比较图交叉点费用写500（正确166.67），n=20错误标记“甲140 < 乙100，选甲”。这是生成内容质量问题；暂无证据指向宿主UI计算。trend为partial/数值核验未完成，不能直接归UI缺陷。 | 复制按钮原生写入/拒绝反馈；真实触摸一次工具栏与guest/展开收起。UI已有桌面/390、键盘、历史性能和真实回放证据，不重跑全链。 | 本机原生Clipboard明确拒绝；OS读回未验；物理触摸无设备。原始比较HTML尚未在本环境定位，见下文，不能以截图冒充原文件。 | UI：正常既有权限下一次复制并记录成功/拒绝，禁止grantPermissions或伪造成功；拒绝反馈可独立短测。设备：现有已登录触屏设备一次工具栏/guest/展开收起/继续输入。质量：**单独建/关联“比较内容数值与标签核验”任务**，附已存prompt/截图/7case，原执行者只读导出已存HTML并绑定哈希；静态核对表达式/标签来源后处理生成验证。trend单列“数值分析未满足核验”，不混成渲染失败。**不新调用provider。** | `artifacts/issue-213-217/evidence/real-provider-{results,settled}.json`；`.../screenshots/real-provider-real-provider-comparison-expanded.png`；`.../presentation-with-clipboard-denied/clipboard-write-interaction.json`；`docs/evidence/issue-213-217/{ACCEPTANCE,UPSTREAM}.md`。 | 将生成质量红例交接到具体关联问题后，可与UI修复独立收口；不能把移交说成已修正。原issue要求的成功复制/真实触摸须有结果，或明确拆出有负责人的设备/权限后续并注明范围，不能宣称7/7质量/真实触摸/复制成功。其余长期性能/任意HTML流式不追加为无限门槛。 |
| **#218 → 浏览器 B，可与A并行** | 已修MemoryTool QueryClient崩溃、授权/删除/重试/历史；未见新增产品红例。 | 现有两尺寸循环只断言各状态标题，未逐状态打开详情；官网截图未成功且原例未实际展开。 | 同官网TLS失败。97条action映射不是97种专用组件；没有对应payload可如实复用官方primitive。 | 现有 **2例(390/1440)** 补running/failed/cancelled/unknown详情展开/收起及正确语义；官方 **1例** memory-chips/web-search/run-activity ready＋实际详情交互，保存对应截图。不要重跑接收预算、runtime或provider。 | `e2e/web/activity-presentation.e2e.ts:39,65`；`e2e/run-activity.tsx`；`docs/evidence/issue-215-218/{source-review,type-map,browser-presentation-including-reference-failure}.md`。精确命令：handoff **B**。 | 两尺寸适用状态详情＋真实官网代表卡对照有产物；环境限制如仍在，必须具体交接未完成项，不能拿38/38产品fixture代替官网通过。不要求新造97种卡。 |
| **#219 → 浏览器 C，可与A/B并行，forum自身串行** | 重构、原生UI/持久化/权限已经过测试；未发现新增具体功能缺陷。旧47/48顺序阻塞已解除。 | 原生减少动画下案例/论坛菜单、移动导航和焦点/状态反馈。 | native/forum/cases配置不读CDP；DB runner过滤CDP变量。简单export不会生效。原生媒体浏览器同A沙箱边界；真实IME/手机硬键盘不在本轮扩展。 | 小型测试配置补官方connect/必要runner透传＋JS/CSS媒体前置；前端 native菜单 **2例**（无需DB迁移），forum states导航 **1例**；若需案例专属入口再定向 **1例**。无需全native/全部forum/provider。 | `e2e/content-editor/browser.e2e.ts:22,97`；`e2e/forum/issue219-states.e2e.ts:4`；`e2e/cases/browser.e2e.ts:30`；`docs/evidence/issue-219/ACCEPTANCE.md` 与正式native7/7。精确命令：handoff **C**。 | 实际原生media前置通过且菜单/导航/焦点短测通过，说明实际覆盖桌面/窄屏。无须重做DDL、部署、全suite或宣称物理触摸/全部输入排列通过。 |

“关联后续”必须有明确负责人、最小动作、证据和未完成范围；不能只留开放评论无限等待，也不能用拆单掩盖已知功能红例。原issue的强制验收若未完成，关闭口径必须由父线程明确记录范围，而非标记该验收成功。

## #217 固定七案与原始HTML定位（可直接交质量负责人）

以下实际文件已读取，根目录均为 `/workspace/LingxiLoop-maintenance-host-source`：

1. **原始固定输入**：`server/src/__integration__/visualize-trigger-live.test.ts:19`。比较输入：甲月费100＋每次2元，乙无月费＋每次5元，n=0..100。正确交点 n=100/3，费用500/3≈166.67；n=20甲140、乙100，应选乙。
2. **七案结果**：`artifacts/issue-213-217/evidence/real-provider-results.json`。comparison succeeded/delivered/6 measured calls；trend partial/delivered/7 calls，整体6 succeeded＋1 partial。这里 `passed` 仅判断状态/投递/计量/引用触发，不验证HTML数学质量。
3. **settled状态**：`artifacts/issue-213-217/evidence/real-provider-settled.json`。comparison `goalOutcome.verification=inconclusive`；trend `status=partial, verification=inconclusive`，备注“Runtime reported unfulfilled numeric analysis; generated content is not a quality pass.” 两案均savedDocuments1、completedReferences1。
4. **已亲自看过的错误视觉原证据**：`artifacts/issue-213-217/evidence/screenshots/real-provider-real-provider-comparison-expanded.png`。截图确有“交叉点 n≈33.3，约500元”和“n=20：选甲方案（甲140元 < 乙100元）”。同目录 `real-provider-real-provider-comparison-ready.png`、`...-narrow.png` 保留。不是本次重绘或重新生成。
5. **原始模型HTML的实际文件路径：目前未找到，不能填写猜测值。** 候选 git tree 的 `artifacts/issue-213-217` 未归档 `.html`/原回放report；当前 `/workspace`、`/tmp` 可读文件范围（排除node_modules/git）搜索 `.html` 的“甲方案/乙方案/交叉点”无命中。汇总JSON仅保存 answer SHA256，**不是HTML哈希**；comparison answer hash为 `d296bf8e8424a092b8863c634e4802943a793d9ab8ec723906057e3283774116`。不能从这个hash推导HTML路径或声称原HTML已交付。
6. **恢复原文件的已有合法查找入口**：`e2e/visualize/serve-trigger-history.mjs:19–28`，原本只读专用本地库 `127.0.0.1/lingxiloop_issue213217_test` 中conversation `visualize-trigger-comparison`；已投递complete assistant的 `visualizeReferences(nativeText(payload))[0].reference.path` 给出原路径，且必须沿用原执行的 `AGENT_OS_HOMES_ROOT`。本次没有访问数据库。请原采集者/持有该测试环境的执行者**只读获取已存reference.path与对应HTML**、记录SHA256/运行身份；不能重跑 `visualize-trigger-live.test.ts`（会重置测试库并调用provider），不能删路径校验、移动其他会话文件或新造样本替代原结果。

### 可直接分配的质量子任务

“基于上述固定比较prompt、现存截图、results/settled，恢复同一已投递原HTML并绑定哈希；静态定位交叉费用标签和n=20分支为何与公式冲突，区分生成脚本/正文核验与宿主渲染；在生成验证责任层增加有界正确性检查/失败反馈，或提交明确可复现质量缺陷。另记录trend数值核验未满足，先读既有原结果再决定是否属于同一缺陷。保留原红例，不做新provider调用、不手改历史HTML制造绿例。UI #217 已验证布局/加载结果可独立引用。”

## 当前阻塞的准确状态

- **HTML恢复**：目标是原比较案已存HTML；当前共享环境中没有定位到文件，原运行 homes 值和专用本地库内容不在现有归档。动作未执行/待原采集者提供路径或只读导出，**不是拒绝，也不是结果不确定**。已完成prompt/7案状态/实际错误截图核对。
- **#216**：root正在处理，计数非零 **25/40**；本子任务未执行维护，不能宣布完成或猜测结果。
- 其他表中TLS、沙箱、Clipboard均是已有历史失败；本次未尝试，无新增授权拒绝或不确定写操作。
