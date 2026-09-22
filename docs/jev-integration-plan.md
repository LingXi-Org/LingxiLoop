# Jev 接入评估与 LingxiOS / LingxiLoop 替换计划

评估日期：2026-09-22。状态：已实施接入和真实 API 试跑，包发布及验证记录见第 8 节；未部署生产。

最初评估依据：LingxiLoop `8b132f4`、本地 LingxiOS `9ccb102`，以及实际安装的 `@lyyzka/lingxios@3.3.4`。工作区已有其他 UI 修改，本次未修改它们。README 中旧运行时版本不作为依赖事实。

用户已允许对两个项目链路中的大模型节点做破坏性修改和替换。本计划允许删除被替代的 JSON 判定提示词、调整公开接口和升级消费端；保留权限、租约、审批、证据、预算和账本约束。后续用户已授权实施、推送与发包，不等待 CI、不部署生产。

## 1. 结论

**值得引入，优先替换高频、封闭答案集的语义审核，再覆盖检索和教育决策。** 最直接的收益在 LingxiOS：现有记忆写入审核、记忆合成验证都调用生成模型，最终却只需要布尔判断与置信度。Jev 与这类任务匹配。

“尽可能大量”以覆盖有效决策节点为目标，不以增加请求次数为目标。同一份已授权上下文上的独立问题合并调用；能由代码准确完成的判断继续使用代码。新增重排、分类属于质量投资，不能全部算成已节省的大模型费用。

保留生成模型承担回答、教学解释、文档/PPT、代码、记忆正文、摘要和开放式规划。Jev 不提供这些内容。中文样例试跑结果见第 8 节；独立领域质量和净节省尚待验收。

## 2. 已核实的官方能力与限制

| 项目 | 当前事实及设计影响 |
| --- | --- |
| 接口 | 官方为 `POST https://api.typesafe.ai/v1/systemone`，Bearer 密钥；不是 OpenAI chat completions。不能仅替换现有 `OPENAI_BASE_URL`。[API](https://docs.typesafe.ai/api) |
| 输出 | Choice 返回枚举，Score 返回等级的加权分数，Noul 返回 yes 概率；Choice/Score 有分布与 confidence，Noul 没有独立 confidence。[基本类型](https://docs.typesafe.ai/primitives)、[置信度](https://docs.typesafe.ai/confidence) |
| 版本与价格 | 当前固定版本 `jev-1.13.0`；输入 $0.042 / 百万 token，输出免费。生产固定版本，价格配置带版本记录。[Models](https://docs.typesafe.ai/models) |
| 上下文与语言 | 每请求共 64k token；state 加最长单题不超过 32k；仅文本。英语效果最佳，中文需独立验收。[Models](https://docs.typesafe.ai/models) |
| 问题组织 | 相同 state 的问题可并行，但每题独立，不会自动读取其他题的答案；依赖前序答案的判断需要在代码里分阶段。[Introduction](https://docs.typesafe.ai/introduction) |
| 已知不足 | 数学、时间比较、多跳判断、冗长无关上下文、对抗文本均有局限。结构合法不等于判断正确。[官方限制](https://docs.typesafe.ai/model-jaggedness/jev-1.13) |
| 数据处理 | 官方承诺不以输入训练模型；普通服务不能据此视为零保留，企业 ZDR 需另核实。隐私政策说明美国托管且不面向未满 18 岁者。教育数据接入前需确认适用的数据处理约定；初测仅用合成数据。[Models](https://docs.typesafe.ai/models)、[隐私政策](https://typesafe.ai/legal/privacy-policy) |

以上为官方公开资料，不代表本账户权限、配额或 SLA 已验证。控制台链接跳转登录，未使用任何密钥。仅使用 `typesafe.ai` 官方接口与文档，不采用搜索结果中的仿似域名服务。

## 3. 现有链路与替换地图

下表中的 OS 路径相对相邻 `LingxiOS` 源仓库，Loop 路径相对此仓库。标为“新增”的位置目前没有独立大模型节点，收益必须单独证明。

### A. LingxiOS：优先替换真实存在的判定调用

| 优先级 / 节点 | 已有位置与行为 | 接入方案 | 边界与失败处理 |
| --- | --- | --- | --- |
| P1 记忆写入审核 | OS `src/memory/worker-review.ts` 的 `reviewedMemoryHost` 调用生成模型，输出 approved / explicit / confidence | 用多道 Choice 判定事实支持、敏感信息、矛盾、明确人类请求，按代码合成结论；删除原 JSON 生成式 reviewer | 先保留 `prepareMemoryReview` 的授权与版本检查；模型失败拒绝写入。explicit 的语义识别不能授予权限，删除/恢复/遗忘的现有保护照常执行 |
| P1 记忆合成验证 | OS `src/memory/processor.ts`，`memory-synthesis-verification` 是第二次生成调用 | 保留 proposal 生成正文；将第二次调用改为每项变更的证据支持、冲突、重复和跨域泛化判定，合并为一次或有界批次 | 显式/锁定记录、版本、过期日期、忘记 epoch 在代码校验；有任一不通过或未知，整批不提交，首版不引入部分提交 |
| P2 交付内容审核 | OS `src/outcome/content-check.ts` 的 `checkCandidateContent` 生成 missing / limitations 和原文引用 | 改成“确定性分段 + 带来源的候选要求 + Jev 逐项 Choice”；输出满足/缺失/冲突/未知、声明限制类型；程序由 span ID 还原原文和固定 reason code | 这是契约重构，不能把任意 JSON prompt 直接交给 Jev。原请求、修订、遗漏要求、限定条件都必须覆盖；超限或覆盖不全返回未知，不能返回空 missing 冒充成功 |
| P2 独立答案审阅 | OS `src/eval/review.ts` 的 `reviewAnswer` 返回 verdict + rationale | verdict 改为 Choice，rubric 拆成原子题；rationale 改成确定性诊断和原文定位，确需解释时单独生成 | 允许修改消费者契约；仍是语义评审，不能替代运行时完成验证 |
| P2 记忆召回重排（新增） | OS `src/memory/semantic.ts`，已有关键词 + embedding + RRF；`src/memory/runtime.ts` 组装上下文 | 授权后候选重排，筛出相关、过期语义、相互矛盾内容；最多先取 16 个候选 | 不替代 embedding，不删除 core/pinned/explicit 保护内容；故障保留原召回。控制面不直接增加付费推理：需要 Worker 侧消费候选的明确接口 |
| P3 技能与执行路线选择（新增） | OS `src/runtime/runtime.ts` 主循环；Loop `server/src/agent-runtime/harness.ts` 当前仅少量产品 skills | 已授权 skills / 工具类别 / 当前成员形成 Choice 候选；可输出无需工具、需要检索、需要某专家等建议，减少生成模型的选择负担 | 目前技能数量不大，优先级低。不得基于分类扩大 grants，跳过执行审核，或将只读模式变为可写 |
| P3 有限候选动作选择（部分替换） | OS 主循环 `model.run` 当前同时承担规划、参数/内容生成与回答 | 对确实具备完整已验证参数的封闭候选动作，Jev 选 candidate ID，经正常工具执行路径调用；开放参数仍由生成模型产生 | 不能凭 Jev 构造任意参数；发送、发布、删除等动作继续按原审批规则。避免把每个 agent turn 都加一层付费路由 |

关键事实：OS `ModelPurpose` 目前把记忆 proposal、verification 和 write-review 都归到 `memory-synthesis`。**不能按这个 purpose 统一切换模型**，否则会把需要生成正文的调用一起替换掉。先拆出准确的 decision purpose，再替换实际调用点。

### B. LingxiLoop：广覆盖现有业务流程

| 优先级 / 节点 | 具体位置 | Jev 的作用 | 业务约束 |
| --- | --- | --- | --- |
| P1 知识检索重排（新增） | `server/src/modules/knowledge/runtime.ts::retrieveKnowledgeState`；自动上下文与 `knowledge.search` 共用 | 对授权候选做相关性 Score，改善 top-k；在最终分配 S1 等引用标记前重排 | 保留租户、项目、群聊全体读者可见性与 excluded 过滤；保留 RRF 回退 |
| P1 证据充分性/矛盾（新增） | 同上及 `server/src/agent-runtime/context.ts` | 与重排共用 state，判断材料是否足以回答、是否互相冲突，交给生成模型决定补搜 | 首轮不自动跳过检索；不能因低分删掉反证，也不能把“未找到”判成“事实不存在” |
| P2 引用语义审核（新增） | `server/src/agent-runtime/citations.ts`、OS 交付审核 | 解析真实引用链接后，对每个 claim 与已读 excerpt 判定支持/反驳/未知 | 当前 Loop 校验主要是格式。保留格式检查；截断源文只能支持可见部分。接入异步审核阶段，不能把网络请求塞进同步 `validateAssistantText` |
| P2 学习 rubric 判定（拆分现有 agent 工作） | `server/src/modules/learning/evaluation-application.ts::proposeLearningEvaluation`、`agent-tools.ts` | 每个 rubric 维度单独 Choice/Score；Jev 提供评级候选，生成模型只写反馈 | 不将小数 Score 四舍五入后直接写 L0–L4；等级采用明确枚举。教师审批、独立证据、降级复核和 `projectLearningState` 保留 |
| P2 错因与证据类型（新增） | `server/src/modules/learning/preset.ts`、`evaluation-application.ts` | 区分概念误区/操作失误/信息不足，以及学习者自述/第三方描述/假设情境/真实作答证据 | 数学正确性仍需求解器、执行验证或生成模型推理；不能把“我懂了”当掌握证据 |
| P2 学习事项分类（新增） | `server/src/modules/learning/cases-application.ts` | 建议事项类别、支持需求与审阅优先级，辅助已有案件动作 | 不自动做降级、教师 override 或心理诊断，不改变状态机及版本冲突规则 |
| P2 Mission / 活动候选排序（新增） | `server/src/modules/learning/missions-application.ts`、`activities-application.ts` | 对已满足前置条件的活动评估目标相关性与难度适配，排序给规划 agent | 前置条件、到期时间、剩余任务数量由代码计算；长期计划正文继续生成 |
| P2 Canvas 报告质检（新增） | `server/src/modules/canvas/runtime.ts::verify`、`evidence.ts` | 检查报告是否覆盖任务、是否忽略反证、是否支持其结论，补充现有资源读回验证 | Jev 不能代替独立 verifier、当前报告消费、真实完成状态或 evidence 比较；异步调用放在不持有写锁的阶段，提交前重新核验版本 |
| P2 独立黑盒 Eval Judge（替换） | `eval/src/models.ts`、`contracts.ts`、`runner.ts` | 新增 Jev judge，先替换封闭事实/约束检查，再迁移 TaskSuccess 为原子评分；保留 Autoevals 对照直至通过独立标注集 | Eval 无产品 imports、运行时凭据或账本依赖；更换 judge 必须新 suite/engine 指纹与新 baseline，不沿用旧基线 |
| P3 研究结果筛选（新增） | `server/src/modules/research/index.ts::searchResearch` 与其 agent 工具 | 对真实 OpenAlex 标题/摘要做主题相关性、资料类型排序 | 日期、DOI、URL、来源抓取和 SSRF 仍由代码处理；摘要不是全文 |
| P3 记忆持久价值筛选（新增） | OS `src/memory/processor.ts` proposal 之前 | 判断某项已提交交互是否值得进入 synthesis，减少无价值正文生成 | 明确保存/修改/遗忘请求走原正式流程；不能用筛选跳过用户明确要求 |
| P3 Teacher digest 关注点（新增） | `server/src/agent-runtime/context.ts` 的 teacher context、`server/src/modules/learning/teacher-reporting-repository.ts` | 对授权的班级事件做关注点排序，供摘要生成器选材 | 学生数量、进度、日程由 SQL 算；正式通知不允许被分类器抑制 |
| P3 邮件/研究文本意图（新增） | `server/src/modules/email/application.ts` 及对应 agent tools | 在已授权读取内容上分类、排序、提出回复需求 | 不修改入站 webhook 校验、收件人权限、外发审批或未知效果重试语义 |
| P3 PPT 文本内容质检（新增） | `server/src/modules/presentations/facade.ts`、`static-validator.ts` | 检查幻灯片文本主题覆盖、重复和证据支持 | HTML/幻灯片生成仍用生成模型；静态结构和尺寸校验保留；Jev 无图像输入，不能检查视觉布局 |

不接入 Jev 的现有确定性环节：`notifications/routing.ts` 的静默时段与发送窗口、teacher digest 的 SQL 日期计算、权限/grants、SSRF、账本金额、schema 校验、幂等与去重键、租约、资源版本和任务完成回执。语义重复可以建议，主键/业务幂等不能交给模型。

## 4. 最小实现架构

### 4.1 将决策与生成调用显式分开

在 LingxiOS 增加一个具体的 Jev HTTP client 和小型 typed decision 契约，通过现有公共包入口导出；使用 Node 原生 fetch，不先添加 SDK、模型路由框架或插件系统。Jev 的 SDK 可用，但当前一个接口无需再引入依赖。

`ModelDriver.run/compact` 继续用于生成；新增显式 `decide` 能力及逐节点 purpose，例如 memory-write-review、memory-synthesis-verification、content-review。不要实现一个伪 OpenAI adapter，也不要从提示词字符串识别任务。Worker 配置独立 decision provider，正文模型继续使用当前生成 provider。

Loop 消费新版本的公共 client/契约，在产品服务中写业务问题集；OS 不写入课程、学生或教师规则。Eval 维持独立包，使用其独立 HTTP 客户端与契约，不导入 Loop/OS 运行时。两处很短的协议客户端无需为消除少量重复另建共享 monorepo 包。

### 4.2 每次调用的顺序

1. 使用代码完成主体、租户、项目、来源版本与受众授权，过滤候选和敏感字段。
2. 固定 `model + purpose + questionVersion + requestVersion + sourceVersion + candidateHash`；问题文本显式指向字段，不能只靠题目 key 传达语义。
3. 限制状态大小、候选数量和并发；相同授权上下文的独立问题合批，禁止跨租户/受众混批。不会因为达到上下文上限就静默截掉验收要求。
4. 先预留模型调用次数/token/费用/时长预算，再发请求；支持 AbortSignal，取消后禁止提交结果。
5. 严格校验 question IDs、答案 type、候选集合、有限数值、概率范围/归一误差、score/legend 和 usage；缺题、非法答案、未知计费均不能当成功。
6. 由具体业务决定采用、拒绝、未知或原流程回退；涉及写入，在短事务中重新验证授权、版本、租约及 prepared hash，避免外部 HTTP 持有写锁。
7. 记账与持久化只有脱敏元数据、问题/模型版本、分数、决策码、latency 和 usage；不记录 state、prompt、正文或 HTTP 原始错误响应。

Choice confidence 是分布统计，不直接等价于“该操作正确的概率”，不能把现有 0.7 审批门槛机械搬过来。每个业务用人工标注验证其阈值；必要时引入显式 uncertain 候选。多维审核不能用平均分掩盖某一条严重不通过。

### 4.3 预算、账本与故障语义

- OS：扩展 `src/model/execution.ts` 的调用观察、价格快照和准入，使 decision 使用自己的价格而不是正文模型价格。复用持久预算、root lineage 和调用 ID；协议枚举变化同步控制面/Worker 与序列化测试。
- Loop：沿 `server/src/agent-runtime/runtime.ts::recordModelCall` 将原生 decision 观察投射入共享 ledger；禁止重复计费。产品直接调用使用 `server/src/llm-ledger.ts::recordLlmCall`，带 company / conversation / purpose，输入输出 usage 映射明确。
- Eval：独立 `EVAL_JEV_*` 凭据、定价、Judge 预算与 fingerprint；不自动继承 `TYPESAFE_API_KEY`。未来评测由命令显式把临时密钥注入该进程，不修改产品环境。
- 默认一次尝试；429/529 只允许在总 deadline 与预算内有限退避，遵守 Retry-After。超时/断线造成 usage 未知不能按免费成功处理，禁止隐藏自动重试。
- 排序可回退原顺序；新辅助提示可返回 unavailable；记忆写入审核不可回退为“允许”；验收或评分必需项未知则不能通过。主业务的回退须有原因指标，不吞掉失败。
- 首版不建新的决策数据库、全局缓存或任务调度器。新持久字段/协议若确实需要，才增加版本与迁移；Loop 的历史 baseline migration 保持不动。

### 4.4 运行边界

后台审核、合成和维护保留 Worker 执行。自动检索当前在控制面加载上下文时触发，不能简单在 `loadContext` 中加上一串付费调用。实施时将候选快照传给 Worker 决策阶段；如果需要新的公共 hook，在 OS 源码提供受预算约束的明确入口。用户主动查询的产品 API 可做有界同步重排，但仍需产品账本，不启动后台循环。

最终引用审核在交付提交前完成，不能先向用户发布不受支持内容再当作“审核成功”。现有草稿流与最终提交的可见性语义要单独验证。

## 5. 分阶段实施与验收

### P0：凭据验证与中文基准

- 临时文件已准备：仓库根 `.env.jev.local`，只需填写 `TYPESAFE_API_KEY=`。Git 的 `.env.*.local` 忽略规则已验证；当前 server Docker 构建采用白名单，不包含这个根目录文件。应用不自动读取它。
- 实施时新增最小 smoke 命令：显式读取该文件，先查 `/v1/models`，再对合成中文 state 一次请求覆盖 Choice/Score/Noul。控制台只输出模型、结果结构是否合法、耗时和 usage，不输出密钥/header。
- 先建立约 300–500 条人工可核验样本，覆盖中文/中英混合、否定、引用指令、篡改证据、撤销授权、模糊保存请求、长上下文、边界等级与不确定样本。按场景划分训练式调参集和冻结 holdout，不拿同一批样本调阈值又验收。
- 对比当前模型、Jev 与确定性方法；记录误放行、误拒绝、覆盖率、分数校准、p50/p95、真实 input tokens、错误率和总链路费用。旧生成模型的答案不是 ground truth。
- 初测建议单独设 $1 的 Jev 请求预算，正文/Judge 对照另计且显式设预算。本轮仅执行有界合成样例试跑，未执行完整对照基准。

### P1：先替换记忆审核，接入检索重排

- OS 新增具体 decision client、公开配置与预算观察；替换 write-review 和 synthesis-verification，保留正文 synthesis。
- Loop 知识重排先比较已有 RRF 候选；需要更大候选池时单独区分候选上限与返回上限，避免现有 `limit <= 8` 使重排前就丢失有用命中。
- 每个节点支持 off / shadow / active 的明确上线状态；只配置已实现节点，避免泛化配置框架。shadow 不控制业务结果但仍计费；active 才真正删除/停用旧判定调用，避免长期双调用。
- 建议验收目标：相对人工标签不降低关键判断质量；冻结危险写入样本零误放行（仅代表有限测试集）；被替代判定环节成本下降至少 50%；检索 nDCG@k 或有效引用命中率显著改善。具体样本和容差在运行前冻结。

### P2：拆分交付评审、学习评分与 Eval Judge

- 对内容审核先用有来源 span 的协议表达原请求、修订与候选回答。Jev 逐项判断；保留遗漏要求检测，不能完全依赖生成模型给出的 checklist。
- 允许破坏性修改 missing / limitations / rationale 协议，但先更新所有消费者、快照与回放版本。固定 reason code 可替代自由文本解释，不伪造 Jev 生成过解释。
- 学习 rubric、引用检查、Canvas 报告语义和独立 Eval 逐项启用；每次启用都冻结自己的问题版本与验证数据。
- 必须保持既有教育、审批、证据和工具边界套件；Jev 若用于产品判定，不应再由相同模型/相同问题自我证明正确，保留独立人工或异构 Judge 的验收。

### P3：覆盖其余合适节点

按真实调用量与误差收益，依次扩展记忆价值/召回、Mission 活动排序、事项分类、研究筛选、摘要关注点、邮件与 PPT 文本审核。技能/工具路线仅在减少主模型调用或上下文的实测收益成立时启用。没有收益的节点保持 off，不为覆盖数量增加在线依赖。

### P4：发布新 LingxiOS，再切换 Loop

- 在 `E:/lyyzka/LingxiOS` 修改和测试源代码，发布新精确版本，再更新 Loop 根目录及 server 的依赖/锁文件；禁止改 `node_modules`、复制内部运行时代码或使用临时兼容 adapter。
- 公共接口破坏性变化按版本策略发布，检查 package/protocol/schema/Harness semanticVersion 及现有待审批动作兼容性。模型/问题集变化纳入指纹，旧审核不得自动批准新语义动作。
- 若改动影响持久运行绑定，先停止新任务准入并排空旧 Worker；版本化读取仍在等待的请求，不让旧 Worker 与新协议混用。
- 产品侧按租户/节点逐步启用；本轮用户已授权推送两个仓库及发布包；不等待 CI、不部署生产。

### P5：删除旧判定路径与回滚准备

- 验收通过后移除被替代的长判定提示词、专用 JSON parser 与无用配置；正文生成、结构验证与安全边界保留。
- 稳定后去掉无收益 shadow 双调用。回滚使用已验证的旧包/应用版本和对应配置；未迁移数据不得被旧版本误读。
- 排序服务可以立即回退原算法；审核服务故障不自动放行写入。回滚演练包含取消、超时、请求修订、来源撤回与 usage 未知。

## 6. 验证归属

最初评估阶段仅创建计划；本轮已进入实施，以下阶段检查与末尾实施记录共同描述交付状态。

实施时按阶段运行以下已有检查，并补充最小 Jev 协议/错误路径测试：

- OS 局部：`npm run build` 后定向运行 `dist/test/model-execution.test.js`、`memory-governance.test.js`、`memory-synthesis.test.js`、`semantic-memory.test.js`、`runtime.test.js` 中相关文件。
- OS 公共接口/协议改动：按仓库规则执行 `npm test`；涉及持久预算或恢复时增加独立测试库上的 `test:postgres-stores` / `test:worker-recovery`。
- Loop：`npm run server:typecheck`、受影响文件的 lint/测试；集成文件用 `npm run test:integration -- --file ...`，覆盖 `native-memory.test.ts`、`knowledge-vertical-slice.test.ts`、`confidence-citations.test.ts`、`learning-collaboration.test.ts`、`teacher-agent.test.ts` 中受影响项。
- Eval：改动独立包时按 agent-eval 指南安装并运行 `npm run eval:check`；新增本地 HTTP fixture 验证缺题、非法概率、限流、超时、取消、usage 未知、预算与 baseline 不兼容。真实模型评测另行运行，不能将离线测试当质量基线。
- 不使用 Playwright；不为文档新增测试框架。

## 7. 成本判断与最终决策

按当前官方价格，若一次请求实际计费输入为 2,000 token：单次约 $0.000084，10,000 次约 $0.84，1,000,000 次约 $84。这里仅为 Jev 输入费用计算，不含生成模型、重试、网络和存储；问题、候选和上下文都计入实际输入。

净收益计算：被移除的原模型调用成本 − Jev 成本 − 回退/额外生成成本。质量新增项需以检索命中、误差或用户结果衡量。官方宣传的速度和降本倍数不能当作本项目实测。

**推荐首批交付：Jev 决策基础设施 + 记忆写入审核替换 + 记忆合成验证替换 + 知识检索重排 + 独立中文基准。** 第二批重构内容审核和教育/Eval 判定，再扩展其余高收益节点。这样能大量覆盖合适位置，同时把真正减少生成调用的收益与新增质量能力分开验证。


## 8. 本轮实施记录（2026-09-22）

版本：LingxiOS 4.0.1、控制面协议 12、数据库 schema 11；Loop 通过精确发布依赖接入，不复制运行时源代码。产品迁移 `0029_lingxios_4_0_1` 只验证并更新安装版本，保留所有业务与账本数据。升级前排空旧任务、同时更新控制面与 Worker；本轮不执行生产迁移或部署。回退须同样排空任务并恢复匹配的包及安装版本，不混跑协议。

已实现的调用覆盖：

| 位置 | Jev 职责 | active 行为 |
| --- | --- | --- |
| OS memory.apply 等统一写入入口 | 显式授权、支持证据、安全、一致性 | 替换生成式记忆审核；所有门通过才可批准 |
| OS memory_synthesis | 批次安全、逐项来源支持、程序候选验证 | 替换验证调用；提案仍由生成模型输出 |
| OS 召回 | 相关性 Score | 重排已授权前 10 条 recalled，不删 core 或记忆 |
| OS 交付审核 | 原文要求满足、限制、阻碍定位 | 用 Choice 和原文片段替代自由生成审核 JSON |
| OS 引用审核 | 可见片段是否支持具体引用文字 | 缺支持转成内容审核问题，marker 不变 |
| OS eval 公共接口 | 按 rubric 原文分项审核 | 显式 `reviewAnswerWithDecisions`；独立调用方预算 |
| Loop 知识上下文 | 相关性、充分性、矛盾 | 重排既有 8 条候选；保留矛盾证据 |
| Loop 学习 | 自述/作品/假设分类、支持策略、目标相关性 | 提供建议；不改 mastery、日期或先修规则 |
| Loop 实际学习读回 | L0–L4/unknown、误区分类 | 仅有实际作品和 rubric 时判定，教师确认与确定性规则不变 |
| Loop 教师 | 汇总/待审核/规划/个体请求 | 仅当前授权教师上下文的响应建议 |
| Loop Canvas | 缺证据/复核/综合/分工 | 提供协作建议，不代替落库报告或授权调度 |
| Loop 知识/研究/学习/邮件/PPT 工具读回 | 相关性及领域问题 | 只取当前请求版本、现存方法授权下的成功只读结果 |
| Loop PPT、邮件 | 实际文本覆盖与消息分类 | 缺正文输出未知；不做版面判断，不发送邮件 |
| 独立 Eval | PASS/PARTIAL/UNSUPPORTED/WRONG_SCOPE/FAIL/UNCERTAIN | 可选新 Judge、独立客户端/凭据/CNY 价格/指纹 |

Loop 的产品判定批量放在 Worker 的 `prepareDecisionContext`，复用 OS 的持久预算与用量 outbox，不在数据库写事务里等待外部模型。缓存只保存答案，按租户、主体、work、fence、请求修订和配置隔离，最多 128 项。知识/目标/工具候选在已有授权集合内有界取样；完整安全审核超长则拒绝，绝不截断人类要求后批准。

配置：`TYPESAFE_API_KEY`、`JEV_MODEL=jev-1.13.0`、`JEV_MODE=shadow`，可用 `JEV_MEMORY_WRITE_MODE`、`JEV_MEMORY_VERIFY_MODE`、`JEV_CONTENT_MODE`、`JEV_MEMORY_RECALL_MODE`、`JEV_PRODUCT_MODE` 分别设 off/shadow/active。密钥临时文件保留且被 Git 忽略；应用不会自动加载它，正式配置在 Worker 环境中提供。shadow 会产生额外费用，不应无限期保留。无 key 时沿用旧行为。

真实 API 试跑：模型与 Choice/Score/Noul 协议可用；12 个合成中文记忆样例共 12,099 输入 token、1,812 输出 token，估算 $0.000508158。9 个风险样例拒绝、3 个正常偏好也拒绝（正常样例最小置信度 0.78–0.88）。这说明当前双阈值 0.95 下的中文审核召回不足，不能直接全量启用主动写入审核。详细结果在 OS 的 `docs/jev-pilot.json`，可运行 `scripts/eval-jev.mjs` 复现。它不是独立校准，不能把 9/12 当生产准确率。

因此本轮交付接入代码与主动替换能力，默认 shadow；不删除仍需作为比较基线的生成审核路径。P0 的 300–500 条独立人工标签、中文领域质量/延迟/净成本对照、逐租户放量和 P5 删除旧路径仍属于验收后阶段，尚未达成。排序和产品建议可先按节点启用，但本轮不改生产环境开关。知识候选仍为既有 8 条、PPT 仅实际可见文本、教师和学习建议不自动落库，避免把未证实的收益写成完成结果。

计费补充：真实产品账本集成暴露了 4.0.0 控制面使用通用价格覆盖 Jev 价格的问题。4.0.1 在预留时按固定模型选择控制面可信价格，并使用持久预留价格结算；Loop 最终仅锁定 4.0.1。运行时模型费率与 Worker Jev 配置分开，通用模型费率不得代替 Jev。


shadow 的当前范围：执行并计量 Jev 请求，保持原判定/排序结果；不持久化模型原始语义答案，也不自动生成逐例分歧报告。语义差异比较需通过独立 Eval 数据集完成。不要把仅有 shadow 用量当成质量验收结果。

发布状态：`@lyyzka/lingxios@4.0.1` 已发布到 GitHub Packages，包源码提交 `53218beb7992c308bdc67f0504f6f26eeef32971`，tarball SHA-1 `e21769eeceeb91cc81f0f0c62a26cd6db7ca8d33`。OS 283 项发布前测试通过。GitHub Packages 的 `npm deprecate` 返回 400，4.0.0 仍存在；消费者必须使用 4.0.1，Loop 根、server 和 Eval 适配器均锁定此精确版本。


最终本地验证（4.0.1）：

- OS 发布前构建、类型检查与全部 283 项测试通过；真实 PostgreSQL stores/recovery 检查通过。
- Loop `server:typecheck`、Web `typecheck`、8 个受影响文件的 Biome lint 通过；76 项服务端测试通过，shadow 失败路径修正测试夹具后定向重跑 2 项通过。
- Eval 升级精确公开依赖后 `eval:check` 通过（16 项），没有新增依赖或复用运行时判定实现。
- 独立临时 PostgreSQL/Redis 上 `db:migrate` 首次应用 29 项、第二次 no-op 通过；6 个相关集成文件全部 48 项通过。包括真实 Worker 产品建议、固定引用、Jev 替换记忆审核、每次 100 输入 token/30 免费输出 token 按 5 微美元保守取整进入产品账本，以及租约任务阻止协议迁移。
- 未等待远程 CI、未部署生产；没有修改生产配置或数据库。临时密钥文件不在提交中。
