# LingxiLoop 3.5.8 在线 host-source 准备独立验收

结论：**PASS — 在线 host-source 准备链路通过验收；9 个实际终态齐全，无待补终态，也无本次证据范围内阻止进入维护预检的 P1/P2。** 此结论截至准备完成时刻 2026-10-20 14:08:31.272 UTC，终态于 14:12:04–14:12:18 被生产执行者只读重取。它不等于产品已部署、数据库已迁移或业务最终验收。

审查者 `/root/host_preparation_review` 只读取本地材料、源码和 Git 对象，运行离线验证；未请求生产 API、未改生产配置、未执行停服/部署/DDL/备份，也未读取凭据。已遵循仓库 AGENTS.md 及 `.agents/skills/operate-komodo-production/SKILL.md` 对精确更新终态、部署身份和 Web/Worker 健康证据的要求。

## 绑定材料

- 实际执行 driver：`/tmp/lingxi-358-production/prepare-direct-host-sources.mjs`，SHA256 `b9265a1403b818eb5c8ecbb19fd6246c3e4dc09ce90df778c54dd9a512b2e8b7`。
- 封存 plan：`maintenance-host-plan.json`，planHash `67db9eb7800edda238fb8e9a72dbcb28793f50314a92a731c361874842ac0849`，文件 SHA256 `7ea3bb53b0e23c0382512193932f18be58d472dc01d14dc588b40cab97d0d9eb`。
- 准备回执 `online-direct-host-preparation.json`，SHA256 `feba715e52344e08642b4b01f29358655d8c9ec0ca6ecf88f3bfa97ff73403c7`。
- 新鲜终态 `online-direct-host-terminal-receipts.json`，SHA256 `e59574a8496823d113478f792d9677f8013543ff454b84983c6808536e4b307b`，绑定上述准备回执和 plan。
- 终态采集器 `collect-direct-host-receipts.mjs`，SHA256 `1bd7b335551c7929ec28d59a9e95fc586f2b9288e47deae7e694fd9ede48a6c1`。逐个读取精确 GetUpdate，校验操作、Stack ID、Complete/success 和原始 marker 字段；只输出最小摘要，不保存完整日志。
- 维护工具当前提交 `16313a843aa824050e7cfb88f66db80193a88492`，与本地 CI 摘要一致：run `39436323154` completed/success，deploy-contract job `118674364239`，publish/deploy/update-manifests/rollout 全部 skipped。此项为对执行者 gh readback 摘要的本地核验，本审查未额外请求 GitHub API。维护工具提交和目标应用镜像提交是两种身份。

所有输入哈希、精确断言、可重复结果见同目录 `verify.py` 和 `acceptance.json`。执行 `python3 /tmp/lingxi-358-online-preparation-acceptance/verify.py` 可重复全部本地核验；不发网络请求。当前完整 `validatePlan` 离线检查也已通过。

## 实际动作及耗时

准备窗口为 **14:03:55.359 → 14:08:31.272 UTC，共 275.913 秒**。三次写入和六次 oneoff 严格串行，9 个 ID 唯一，实际服务端开始/结束时间无重叠；后续提交均在前一次完成之后。

| 顺序 | 动作 | Stack | 精确 update ID | Komodo 实际执行 ms |
|---|---|---|---|---:|
| 1 | WriteStackContents | A | `6ad774ede06d5e1f79836dca` | 96 |
| 2 | WriteStackContents | B | `6ad77507e06d5e1f79836dd2` | 102 |
| 3 | WriteStackContents | core | `6ad77520e06d5e1f79836dda` | 95 |
| 4 | metadata 第一轮 | A | `6ad7754be06d5e1f79836de4` | 7317 |
| 5 | metadata 第一轮 | B | `6ad77565e06d5e1f79836de8` | 6717 |
| 6 | 只读 state 第一轮 | core | `6ad7757ce06d5e1f79836def` | 673 |
| 7 | metadata 第二轮 | A | `6ad77594e06d5e1f79836df6` | 6922 |
| 8 | metadata 第二轮 | B | `6ad775ace06d5e1f79836dfa` | 7961 |
| 9 | 只读 state 第二轮 | core | `6ad775c4e06d5e1f79836e01` | 681 |

9 个实际终态均 `status: Complete`、`success: true`，目标 type 均为 Stack，精确 ID 为 A=`6aa8a411b35d27bdd4e12aef`、B=`6aa8a414b35d27bdd4e12af1`、core=`6aa8a3e8b35d27bdd4e12ae0`。

driver 包含 host proof 与 API 等待的 metadata 用时为 12.356–13.243 秒；core 只读 state 为 5.855–6.584 秒。15 次 host hash 证明耗时 min/median/max 为 1.691/2.798/4.708 秒。以上是本次在线准备的分段观测，不能当成普遍 p95 或模型/数据库性能结论。

原 Git 方案已失败且不确定状态已解除：driver 在任何新操作之前，重新读取 `6ad7723fe06d5e1f79836d40`，确认精确 A Stack / RunStackService / Complete / success=false。新 driver 记录原回执 SHA256 `1cb89f3812661b5414b9f812218f60e00f26ff2d78a97b53e9cb3d4411d6c119`，没有重试该动作；最终 `gitCloneSubmissions: 0`。因此新路径已有实际证据跳过三栈 Git clone，旧失败不是悬挂并发任务。

## 文件、运行身份和数据库边界

三栈配置均只改 branch/commit/reclone/files_on_host 四字段，三次完整配置读回断言通过。实际写入为 `f56db73dabbaec1e92a421bbad76c239ed8d1ae2` 下的三个普通 `100644` 公共模板，`compose.yml` 相对路径、已有归属目录和 env 路径均受 driver 前置校验。三次写入终态后及两轮执行前后共 15 次 host-source 校验全部精确匹配：

| Stack | Compose SHA256 |
|---|---|
| A | `4ad4d738a8f41d549412a71c4de8c78e5fb3f2c5365be86d5fa892db8877b050` |
| B | `145ded6c585329317b54c2cca24e80870ab151d870a7c749bd2724dd852c5a26` |
| core | `dda3dd16ff30968905f2083d271a28d12e1519f713ce46a7fead19a02ce82dab` |

四次目标 metadata 均为应用 `d1075e35e16721979b484c2d9e33eeb56468ce9d` / runtime `3.5.8` / native schema `13` / product `48`。driver 与终态采集器还逐字段验证 protocol、schemaHash、包完整性、tarball 及完整迁移 inventory 与 plan 一致，持久化回执仅保留窄摘要。

两次数据库只读 state 均仍是 runtime `3.5.6` / installed native schema `12` / product `46`，schemaHash 为 `e8c09fa33af0c073f57effa99aad7beae4f4737dd2966d6584519ec5d4aa1d1a`；采集器校验只读、可见性和全部 46 条迁移清单。**这些结果没有证明、更没有表示 47/48 已执行。**

原 4 个 Web/Worker 容器初始记录与先前恢复回执完全相等，均 running/healthy、restartCount=0，应用仍是 `ac9069460e99a20fac7f2c3de87c60f2bec66924`，imageId 为 `sha256:6ac0d343039dbcb36607ff07e708134a9f5fbcbe6f1e51c04a8bca16801314ee`。driver 在配置/写入/oneoff 周围重复检查完整容器记录，并在最终设置 complete 前再次检查；最终 `originalContainersUnchanged:true`。持久化材料只有初始四行及最终成功断言，没有每次完整健康快照，因此不能把它描述成独立连续健康序列。

## 公网可用性证据

有效 proxy observer 的准备窗口内 **48 次 HTTP 200**；封存最近前后两个样本后共 50 次，均 200。文件 `availability-preparation-window.jsonl` SHA256 为 `4ce2ab19445c122ab74a457e1717a38cd7f3ff3fda5ee338d09a6450323b4d9b`。封存范围为 14:03:52.431–14:08:35.353 UTC；最大相邻采样间隔 12.713 秒。

旧 observer 的 16 条均为 `status:null` / transport-or-timeout，无 HTTP 响应码，不能归为线上 502/503 或本次停机证据；该段也不能据此证明可用。有效 observer 只证明采样时 `/readyz` HTTP 成功，不检查 body，不证明持续零中断、两后端均被路由、认证业务或真实聊天/provider 通过。

## 停服前必须保持的 gate 与盲点

无待补的 9 次终态。进入实际维护前仍须由唯一生产执行者使用绑定当前 CI 的工具重新执行 assertIdle、精确当前配置/三栈 host hash、两宿主 qualified 镜像 digest/ImageId、两端目标 metadata 和 source 12/46 状态检查。以上材料是历史证据，不能替代临近停服时的检查；host 文件也没有不可变锁。

停止旧 writer 以后必须继续既定 drain/无活跃租约 barrier、全新最终备份和隔离恢复验证，再允许 DDL；准备回执不能替代这些步骤。之后以各迁移/部署的精确终态、实际镜像/版本、Web readiness 和两 Worker 健康作为上线完成条件；schema13 以后不得随意重启 native12 Worker。

空 Komodo git_account/registry_account、既有 accelerator 路径及不提交凭据的 driver scope 都经过源码校验；本审查没有检查宿主 Docker/Git 已有 credential helper/cache，因此不声称已独立证明宿主绝无隐含凭据。`pull:false` 也不能取消模板的 Compose `pull_policy:always`，缓存校验不能解释为不访问 registry。既有“不得向 accelerator 发送 token/secret”的限制仍须由执行者在已授权运维边界内保证，不能靠本报告扩大结论。

未发现本次实际序列中重试未知动作、并行写入、Stop/Deploy/DDL/backup 的证据；源码只允许 UpdateStack、WriteStackFileContents 和已限定 oneoff。该判断来自精确 driver 及收集回执，不是对全部生产审计日志的扫描。没有本审查发起而被拒绝、pending 或结果不确定的生产动作。
