# #370：历史 CI 元数据基线

基线：`190930ffbd6d2f14d6d2430b6e41e0bdd2373bb9`。读取时点：2026-10-24 04:29:16 UTC；jobs 元数据采集完成于 04:29:52 UTC。本证据只使用既有 Actions GET 元数据和仓库源码，不下载 job 日志、不下载产物、不触发或重跑 CI、不改变 workflow／runner。#371 拥有实现与同条件优化验证。

**结论：integration 测试步骤是本批样本中最明显的调查入口，但现有元数据不足以确认内部瓶颈、flake 或任何已实现的提速。** 基线 job 的 918 秒中，`npm run test:integration` 为 817 秒（89.0%）；外部 npm 安装 66 秒（7.2%）、容器初始化 17 秒（1.9%）。不能将这 817 秒全部称为测试 CPU 时间，因为它也包着历史包获取、夹具复制、初始化和等待。

## 采样与口径

- [workflow 列表 GET](https://api.github.com/repos/LingXi-Org/LingxiLoop/actions/runs?per_page=25&page=1) 返回最近 25 次，固定选择最新 20 次，全部为同一 workflow `337855838`，均 `run_attempt=1`。20 次创建时间从 2026-10-23 15:37:53Z 至 2026-10-24 03:25:23Z；11 success、7 failure、2 cancelled。没有同一 head 的成功／失败重跑证据，不宣称 flake。
- jobs 使用 `GET /repos/LingXi-Org/LingxiLoop/actions/runs/{id}/jobs?per_page=100&filter=all`。每次返回条数都等于 `total_count`，所有已返回 attempt 均核对为 1。未读取 logs、billing、缓存命中内容或生产状态。
- [workflow-metadata.json](workflow-metadata.json) 保存允许字段投影：run/head/event/attempt/outcome、job/step 时间、源码 blob、分组、派生统计。step 名字去重为 `stepNames`；每个 step 数组的字段顺序见 `stepColumns`，其中 `nameId` 为零基下标。skipped step 不保留没有执行意义的合成时间戳。
- **scope 分组是已观测 job footprint**，不是声明实际选中文件完全一致。按 event、head branch、检查 job 集合、workflow blob、历史夹具 runner blob分组；PR 的实际 synthetic merge checkout、`INTEGRATION_TEST_FILES`／`CI_TEST_FILES` 输出未从 metadata 获得。代码和测试在各 head 之间也发生变化。这些是历史成本组，不是前后对照实验。
- 新 workflow blob `16586418`，旧 `64e5ed64`，差异为 `src/lib/answerSegment.ts` 的共享范围映射；新历史夹具 blob `babd24e9`，旧 `ae1f2e1a`，差异包括历史 display source 固定。两类修订分开统计，不能把更短的失败或未执行范围当提速。全部已读 head 的 `ci-scope.mjs` 为 `1c121ce8`、主 integration runner 为 `0fb07943`。
- p50/p90 使用 R-7 线性插值，保留一位小数。**延迟分位数只纳入 workflow 整体 success 的运行**；失败／取消只进入状态分类和实际成本。n=1/2/3 的尾部分位数仅是样本描述，没有长期稳定性。
- wall：第一个实际执行 job.started_at 到最后一个实际执行 job.completed_at。check wall：changes/checks/integration 的同类跨度。runner time：各实际执行 job 的区间相加，含并行成本；不等于 wall，也不是 GitHub 计费分钟。skipped、无 steps 的取消占位 job 不计 execution。
- 初始排队：run.created_at→第一个实际执行 job.started_at。job 派发排队：job.created_at→job.started_at。publish 等待 checks 的依赖时间不算 runner 排队。
- 日率窗口固定为 **(2026-10-23 14:38:26Z, 2026-10-24 04:29:16Z]**，左边界是第 21 条、未选中的 [39971352193](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39971352193) 的创建时间；此窗口内正好是所选 20 次。窗口 49,850 秒 = 0.576968 天。runner-minutes/day = 窗口内这些 run 的 job 秒数 / 60 / 0.576968。**这是短窗口归一化，不是完整自然日或长期每日预测**，且按 run 创建时间归属。
- 全窗口消耗为 **373.53 runner minutes**；归一化总量 647.41 minutes/day 仅是跨组成本加总，不用于比较 scope 的速度。各组成本与成功时延如下独立列出。

## 同类组的成功时延与失败率

五组件 = admin、control、deploy-contract、server、web。S/F/C 分别为 success/failure/cancelled。失败率为 F/(S+F)，取消单列；没有非取消样本时显示“—”。单位秒。

| 组 | 可见范围／修订 | 总数 / S / F / C | 失败率 | 成功 check wall p50 / p90 | 成功全部 wall p50 / p90 | 成功 runner p50 / p90 |
|---|---|---:|---:|---:|---:|---:|
| G01 | main push，五组件＋integration＋server image，新 workflow／新历史夹具 | 1 / 1 / 0 / 0 | 0.0% | 929.0 / 929.0 | 1355.0 / 1355.0 | 1852.0 / 1852.0 |
| G02 | stable-answer PR，五组件＋integration，新 workflow／新历史夹具 | 9 / 3 / 6 / 0 | 66.7% | 798.0 / 887.6 | 798.0 / 887.6 | 1332.0 / 1421.6 |
| G03 | stable-answer PR，五组件＋integration，新 workflow／旧历史夹具 | 1 / 0 / 1 / 0 | 100.0% | — / — | — / — | — / — |
| G04 | stable-answer PR，五组件＋integration，旧 workflow／旧历史夹具 | 2 / 0 / 0 / 2 | — | — / — | — / — | — / — |
| G05 | main push，server＋deploy-contract＋integration＋image，旧／旧 | 1 / 1 / 0 / 0 | 0.0% | 855.0 / 855.0 | 1082.0 / 1082.0 | 1274.0 / 1274.0 |
| G06 | react-v3 PR，server＋deploy-contract＋integration，旧／旧 | 1 / 1 / 0 / 0 | 0.0% | 650.0 / 650.0 | 650.0 / 650.0 | 807.0 / 807.0 |
| G07 | main 手动，web＋server image，旧／旧 | 1 / 1 / 0 / 0 | 0.0% | 134.0 / 134.0 | 386.0 / 386.0 | 381.0 / 381.0 |
| G08 | main push，仅 changes | 1 / 1 / 0 / 0 | 0.0% | 13.0 / 13.0 | 13.0 / 13.0 | 13.0 / 13.0 |
| G09 | ui-batch PR，仅 changes | 1 / 1 / 0 / 0 | 0.0% | 11.0 / 11.0 | 11.0 / 11.0 | 11.0 / 11.0 |
| G10 | first-useful-text PR，五组件＋integration，旧／旧 | 2 / 2 / 0 / 0 | 0.0% | 774.0 / 933.2 | 774.0 / 933.2 | 1302.0 / 1488.4 |

G08/G09 仅运行 changes，不能称为“全套检查在 11–13 秒内完成”。G07 为手动 web＋镜像路径，不能与 push main 或 PR 组混算；metadata 不暴露全部 dispatch 输入，不能反推人工意图。没有有效执行的 deploy/update-manifests/rollout job；镜像 publish 成功不是生产部署完成。

## 排队、检查与镜像成本分开

前两列为秒；后六列为上述窗口归一化 runner-minutes/day，包含失败和取消已经消耗的执行时间。

| 组 | 初始排队 p50 / p90 | job 派发排队 p50 / p90 | changes | checks | integration | 镜像 | 部署 | 合计 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| G01 | 2.0 / 2.0 | 1.5 / 2.3 | 0.2 | 14.5 | 26.5 | 12.2 | 0.0 | 53.5 |
| G02 | 3.0 / 3.0 | 2.0 / 2.0 | 3.0 | 138.4 | 209.1 | 0.0 | 0.0 | 350.4 |
| G03 | 98.0 / 98.0 | 2.0 / 4.6 | 0.3 | 15.2 | 23.1 | 0.0 | 0.0 | 38.7 |
| G04 | 10.0 / 14.8 | 2.0 / 2.0 | 0.6 | 28.5 | 28.7 | 0.0 | 0.0 | 57.8 |
| G05 | 2.0 / 2.0 | 2.0 / 2.0 | 0.3 | 5.7 | 24.4 | 6.5 | 0.0 | 36.8 |
| G06 | 3.0 / 3.0 | 2.0 / 2.0 | 0.3 | 4.6 | 18.4 | 0.0 | 0.0 | 23.3 |
| G07 | 3.0 / 3.0 | 2.0 / 2.0 | 0.4 | 3.4 | 0.0 | 7.2 | 0.0 | 11.0 |
| G08 | 3.0 / 3.0 | 2.0 / 2.0 | 0.4 | 0.0 | 0.0 | 0.0 | 0.0 | 0.4 |
| G09 | 3.0 / 3.0 | 2.0 / 2.0 | 0.3 | 0.0 | 0.0 | 0.0 | 0.0 | 0.3 |
| G10 | 2.5 / 2.9 | 2.0 / 2.0 | 0.7 | 30.6 | 43.9 | 0.0 | 0.0 | 75.2 |

G03 的初始等待 98 秒，但 changes job 的派发等待只有 7 秒；其余差额发生在 run 创建与 job 创建之间，metadata 不能判定是平台排队、调度还是其他原因。不把它写成 runner 资源不足。各组多数 job 派发等待约 2 秒，当前证据不支持先更换 runner。

## 最慢步骤组成

[基线 run 40058233189](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40058233189) 的 integration 为 03:25:36Z–03:40:54Z：

| integration 组成 | 秒 | 占 job |
|---|---:|---:|
| npm run test:integration | 817 | 89.0% |
| npm ci --prefer-offline | 66 | 7.2% |
| Initialize containers | 17 | 1.9% |
| checkout | 7 | 0.8% |
| db:migrate | 3 | 0.3% |
| Node 设置、setup/post、时间戳未覆盖的间隔 | 8 | 0.9% |
| 合计 | 918 | 100% |

同 run 的检查跨度为 929 秒，镜像 job 另有 423 秒，其中 build/push action 374 秒、Buildx post 21 秒。初始等待 2 秒，完整 wall 为 1,355 秒，runner 总和 1,852 秒；阶段跨度与并行 job 时间不可直接相加当成本。

G02（相同 PR branch、可见范围和两类 runner 修订）只有 3 个整体成功样本，其 job 分布：

| job | n | p50 秒 | p90 秒 | min–max |
|---|---:|---:|---:|---:|
| changes | 3 | 10.0 | 15.6 | 9–17 |
| checks (admin) | 3 | 80.0 | 85.6 | 66–87 |
| integration | 3 | 786.0 | 875.6 | 618–898 |
| checks (deploy-contract) | 3 | 77.0 | 82.6 | 68–84 |
| checks (web) | 3 | 155.0 | 156.6 | 153–157 |
| checks (server) | 3 | 132.0 | 133.6 | 126–134 |
| checks (control) | 3 | 84.0 | 100.8 | 79–105 |

同组成本最高的前十个成功步骤（按该组样本秒数总和排序；没有合并不同 job 的分位数）：

| job / step | n | p50 秒 | p90 秒 |
|---|---:|---:|---:|
| integration / Run npm run test:integration | 3 | 713.0 | 781.0 |
| checks (web) / Run npm run build | 3 | 63.0 | 66.2 |
| checks (server) / Run npm run server:lint && npm run server:typecheck && npm run server:test && node --test scripts/test-selectors.test.mjs | 3 | 60.0 | 62.4 |
| checks (server) / Run npm ci --prefer-offline | 3 | 46.0 | 46.0 |
| checks (web) / Run npm ci --prefer-offline | 3 | 45.0 | 47.4 |
| checks (admin) / Run npm ci --prefer-offline | 3 | 46.0 | 46.8 |
| checks (control) / Run npm ci --prefer-offline | 3 | 41.0 | 45.0 |
| checks (deploy-contract) / Run npm ci --prefer-offline | 3 | 40.0 | 45.6 |
| integration / Run npm ci --prefer-offline | 3 | 38.0 | 45.2 |
| checks (control) / Run npm run control:lint && npm run control:typecheck && npm run control:test | 3 | 24.0 | 24.8 |

所有组的成功 job/step 分位数在 JSON 的 `groups[].successfulJobSeconds` 与 `successfulStepSeconds` 中；没有用失败早停压低这些数字。安装步骤可观测，setup-node 步骤也已记录；**命中／未命中和缓存传输字节未知**，故不写“缓存失效是根因”。

源码边界说明：

- [ci-scope.mjs:39](https://github.com/LingXi-Org/LingxiLoop/blob/190930ffbd6d2f14d6d2430b6e41e0bdd2373bb9/scripts/ci-scope.mjs#L39) 区分 full integration 与仅修改集成测试文件；空列表由 [runner:78](https://github.com/LingXi-Org/LingxiLoop/blob/190930ffbd6d2f14d6d2430b6e41e0bdd2373bb9/server/run-integration-tests.mjs#L78) 展开为默认全部测试。metadata 不包含此列表的值，不能凭 job 名推断全量文件数。
- [runner:147](https://github.com/LingXi-Org/LingxiLoop/blob/190930ffbd6d2f14d6d2430b6e41e0bdd2373bb9/server/run-integration-tests.mjs#L147) 在一个 CI step 内先执行 current 组，再执行 historical 组；[historical runner:69](https://github.com/LingXi-Org/LingxiLoop/blob/190930ffbd6d2f14d6d2430b6e41e0bdd2373bb9/server/run-historical-migration-tests.mjs#L69) 还包含 npm pack、完整性校验、源码复制与隔离包证明。因此 817 秒不足以分出每文件、历史 fixture 初始化、网络等待或真实验证耗时。
- [runner:138](https://github.com/LingXi-Org/LingxiLoop/blob/190930ffbd6d2f14d6d2430b6e41e0bdd2373bb9/server/run-integration-tests.mjs#L138) 说明现有串行化用于共享测试库的 TRUNCATE 隔离。不得直接提高并行度制造更快却不可靠的结果；真实 PG/Redis、迁移与租户/幂等覆盖保留。

## 失败分类：仅到 metadata 支持的粒度

- G02：6/9 运行 failure，其中 5 次 integration 的 `npm run test:integration` step failure；1 次 server 合并 lint/typecheck/test step failure。合并 step 无法区分具体子命令、测试文件、断言或基础设施原因。
- G03：1/1 integration step failure，且历史夹具实现与 G02 不同。
- G04：2 次整个 workflow cancelled；两者 deploy-contract step 都已 failure。一个 integration job cancelled 但其测试 step 为 failure，另一个测试 step 为 cancelled。保留 job 与 step 两层结果，不将它们抹成“只是取消”，也不猜取消发起者或原因。
- 所有 run attempt=1；多次不同 head 的失败不能证明非确定性。需要同 head、同 scope、同环境的结构化结果才可判断 flake；本任务没有为证明这一点重复运行 CI。

## 机会排序：条件节约分钟／天与缺失证据

目前**每项实际预期净收益均待测，已确认节约为零**。为给 #371 调查排序，下表统一假设“该组成功运行中的指定 step 总耗时降低 10%，覆盖与通过标准不变”，列出条件节约；10% 是敏感性参数，不是已测得或预计必然达到的改善。失败／取消不进入这项节约估算，仍保留在实际成本账。各组分别计算，不合并 scope 的延迟或假定各组运行频率长期不变。安装合计为同组不同 runner 的可加成本，未合并它们的耗时分布。

| 顺序 | 组 | 候选类别 | 成功步骤次数 | 本窗口秒数 | 成本暴露 min/day | 若改善 10% 的 min/day |
|---|---|---|---:|---:|---:|---:|
| 1 | G02 | I：拆解并优化真实 integration 慢路径 | 3 | 2068 | 59.7 | 6.0 |
| 2 | G10 | I：拆解并优化真实 integration 慢路径 | 2 | 1369 | 39.5 | 4.0 |
| 3 | G01 | I：拆解并优化真实 integration 慢路径 | 1 | 817 | 23.6 | 2.4 |
| 4 | G05 | I：拆解并优化真实 integration 慢路径 | 1 | 769 | 22.2 | 2.2 |
| 5 | G02 | N：核对安装／缓存成本与可安全复用范围 | 18 | 755 | 21.8 | 2.2 |
| 6 | G10 | N：核对安装／缓存成本与可安全复用范围 | 12 | 575 | 16.6 | 1.7 |
| 7 | G06 | I：拆解并优化真实 integration 慢路径 | 1 | 563 | 16.3 | 1.6 |
| 8 | G01 | B：核对镜像层缓存／重复构建 | 1 | 374 | 10.8 | 1.1 |
| 9 | G01 | N：核对安装／缓存成本与可安全复用范围 | 6 | 360 | 10.4 | 1.0 |
| 10 | G07 | B：核对镜像层缓存／重复构建 | 1 | 204 | 5.9 | 0.6 |
| 11 | G02 | W：核对 Web 构建热点 | 3 | 192 | 5.5 | 0.6 |
| 12 | G05 | B：核对镜像层缓存／重复构建 | 1 | 189 | 5.5 | 0.5 |
| 13 | G05 | N：核对安装／缓存成本与可安全复用范围 | 3 | 133 | 3.8 | 0.4 |
| 14 | G10 | W：核对 Web 构建热点 | 2 | 130 | 3.8 | 0.4 |
| 15 | G06 | N：核对安装／缓存成本与可安全复用范围 | 3 | 100 | 2.9 | 0.3 |
| 16 | G07 | W：核对 Web 构建热点 | 1 | 45 | 1.3 | 0.1 |
| 17 | G07 | N：核对安装／缓存成本与可安全复用范围 | 1 | 34 | 1.0 | 0.1 |

- **I / owner #371 / 优先调查**：先取得同一选中文件列表的结构化 per-file duration/outcome，以及 current、historical setup、historical tests 分段计时，再找可移除的重复初始化或不必要等待。缺失：这些分段时间、同条件对照、失败归属。#371 可删除或合并已证实低价值的重复测试，并按变更范围选择重测试；保留有效的迁移、持久化、权限和恢复行为覆盖。情景值不构成任何具体删减的证据。
- **N / owner #371 / 次优先**：既有 workflow 已用 npm cache 与 `--prefer-offline`；核对 restore/save 命中、传输耗时及锁定依赖一致性，再评价分离不需要完整安装的任务。缺失：cache 命中率、cache 字节、冷暖对照和恢复完整性。收益需扣除新增缓存／产物传输成本，不能扩大持久权限。
- **B / owner #371 / 测量后再定**：main 两次镜像 build/push 分别 374、189 秒，manual 为 204 秒，各 scope 独立。缺失：Docker layer 命中、构建上下文大小、同 head 对照、产物一致性；不能仅凭三条样本称镜像缓存抖动，不能删除发布硬门禁。
- **W / owner #371 / 较后**：PR Web build 约一分钟，可调查变换热点或已证明重复的构建；缺少构建分解和等价产物验证。main 已有条件跳过独立 Web build，不能把既有 #201 优化再次记为本轮收益。
- 排队不是 runner-minutes 支出；当前 job 派发秒级且缺少 runner 饱和度证据，更换 runner 的调查优先级较低；共享 TRUNCATE 数据库的并发调整需要先解决隔离。PR 取消旧运行、main 串行、授权/隔离/消息持久化与恢复门禁不变。

## 20 次运行索引

完整 SHA、时间戳与各 job/step 位于 JSON。单位秒，runner 包含已执行的失败／取消成本。

| run | head | event | attempt | 组 | outcome | 初始排队 | wall | runner |
|---|---|---|---:|---|---|---:|---:|---:|
| [40058233189](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40058233189) | `190930ff` | push | 1 | G01 | success | 2 | 1355 | 1852 |
| [40057390345](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40057390345) | `1934e339` | pull_request | 1 | G02 | success | 2 | 637 | 1149 |
| [40054633546](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40054633546) | `8fc4f61c` | pull_request | 1 | G02 | failure | 3 | 766 | 1308 |
| [40041756162](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40041756162) | `b88c43c4` | pull_request | 1 | G02 | failure | 2 | 863 | 1287 |
| [40033570929](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40033570929) | `67c1a2c5` | pull_request | 1 | G02 | failure | 3 | 924 | 1526 |
| [40016924334](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40016924334) | `91d67001` | pull_request | 1 | G02 | success | 2 | 798 | 1332 |
| [40013519065](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40013519065) | `a986e9fe` | pull_request | 1 | G02 | failure | 3 | 709 | 1275 |
| [40008877085](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40008877085) | `aa617da2` | pull_request | 1 | G02 | failure | 2 | 833 | 1314 |
| [40006327963](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40006327963) | `9eef8129` | pull_request | 1 | G02 | failure | 3 | 920 | 1496 |
| [40003619849](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40003619849) | `7227c2b5` | pull_request | 1 | G02 | success | 3 | 910 | 1444 |
| [39999527258](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39999527258) | `de7101fe` | pull_request | 1 | G03 | failure | 98 | 817 | 1338 |
| [39998609592](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39998609592) | `96a7f246` | pull_request | 1 | G04 | cancelled | 16 | 478 | 900 |
| [39997392870](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39997392870) | `4734242b` | pull_request | 1 | G04 | cancelled | 4 | 542 | 1101 |
| [39992056195](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39992056195) | `b3f2533d` | push | 1 | G05 | success | 2 | 1082 | 1274 |
| [39988132066](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39988132066) | `ce9a467c` | pull_request | 1 | G06 | success | 3 | 650 | 807 |
| [39985523251](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39985523251) | `7a255c3f` | workflow_dispatch | 1 | G07 | success | 3 | 386 | 381 |
| [39985456623](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39985456623) | `7a255c3f` | push | 1 | G08 | success | 3 | 13 | 13 |
| [39985058468](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39985058468) | `58285db4` | pull_request | 1 | G09 | success | 3 | 11 | 11 |
| [39983844872](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39983844872) | `0ec3bc0a` | pull_request | 1 | G10 | success | 3 | 575 | 1069 |
| [39979922981](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39979922981) | `309d0bb1` | pull_request | 1 | G10 | success | 2 | 973 | 1535 |

## 复核与剩余工作

复用 [#201 collector](../../issue-201/collect-ci.py) 的 started/completed 区间计时原则，本次通过 GitHub connector GET 取数，并补充了 attempt、job.created_at、失败/取消、源码修订与同类分组。没有新增采集脚本：现有 collector 可继续接受明确 run ID，本次采样端点和字段布局已保留，可由后续 owning PR 决定是否把通用增量合回原 collector。

本任务完成 metadata 条数/attempt/非负实际执行区间/分组/累计秒数的离线一致性校验和 `git diff --check`。未执行测试或 CI，也没有 before/after 性能验收。#371 后续应固定源 SHA、实际选中文件及 runner 配置，保留 coverage/outcome，输出不含日志的结构化计时再比较；短样本或未达到等价覆盖时，收益继续标为待验证。

用于直接复算 p50/p90 的算法：

```text
a = sort(successful_samples)
i = (len(a) - 1) * p
Q(p) = a[floor(i)] + (a[ceil(i)] - a[floor(i)]) * (i - floor(i))
runner_minutes_per_window_day = sum(executed_job_seconds) / 60 / (49850 / 86400)
conditional_saving = successful_matching_step_seconds * assumed_fraction / 60 / (49850 / 86400)
```
