# CI 与构建链路消融记录

消融代码基线：`d165a283c9f7c7ea26f2f043173b8cd4a93821fc`。消融阶段仅改测试、CI/构建入口与说明，未修改产品 HTTP API、生产数据库 schema，也未发布或部署。9 月 21 日另获授权，将当前工作区全部改动一并发布；该发布包含独立的运行时升级与会话卡片改动，不计入下列消融收益。

## 实验条件

- Windows 11（10.0.22621）、Intel i9-13900H、20 逻辑核、16 GiB RAM；Node 22.22.2、npm 10.9.7。
- 每项按基线→候选顺序交替三轮。Node 依赖已安装，共享系统缓存；构建每次真实执行类型检查和 Vite。
- Web/Server 测试与 Web/Admin 构建的计时阶段，本任务没有并行运行其他测试/构建。机器上已有服务及其他任务未停止，因此范围明显波动；这些是本机观测，不能当作 GitHub Actions 的耗时承诺。重型步骤及 Python 安装另按三轮串行采样，其间有一套非计时的常规集成验收运行，耗时只作有负载条件下的观测。
- 构建组用同一机器上完整 `build` / `admin:build` 的两次执行，对照一次执行。它验证重复工作的成本，不模拟 Docker 网络、上传镜像、D1 或 Komodo 的总发布耗时。
- 验收期间发现工作区有另一组 LingxiOS 升级与迁移编辑，计时使用单独候选快照，并固定 LingxiOS 3.3.1。完整集成验收另在当前工作区的 3.3.2 上运行；该组升级不属于本次改动或消融结论。

## 三轮耗时

单位：秒；数值为中位数（最小–最大）。每项均为三对成功样本。

| 组别 | 基线 | 候选 | 执行测试数 | 构建次数 | 失败 |
|---|---:|---:|---:|---:|---:|
| Web 默认测试 | 9.61（8.82–12.88） | 8.56（8.49–8.84） | 73→61 | 0→0 | 0 |
| Server 默认测试 | 35.61（22.37–35.96） | 22.48（20.49–30.07） | 80→74 | 0→0 | 0 |
| Web 构建去重 | 142.12（95.31–147.32） | 66.19（45.95–98.45） | 0 | 2→1 | 0 |
| Admin 构建去重 | 121.57（109.64–134.03） | 67.65（57.66–87.32） | 0 | 2→1 | 0 |

原始数据见 [measurements.json](measurements.json)。最初一次服务端候选运行因为合并后的认证断言未容许现有 `as never` 写法而失败，已修正；该次及配对基线列为 `calibration`，未混入成功轮次的统计。

## 重型步骤移出自动 CI

每轮串行运行 Redis 重启、documents、canvas、learning、eval 共 5 个脚本，再记录候选自动范围的跳过结果。脚本使用断言和真实隔离数据库，不使用 TAP，因此以脚本数统计。

| 轮次 | 基线实际耗时 | 基线脚本结果 | 候选自动范围 |
|---|---:|---|---|
| 1 | 159.12 秒 | 5/5 通过 | 5 项跳过，0 条命令 |
| 2 | 140.59 秒 | 5/5 通过 | 5 项跳过，0 条命令 |
| 3 | 129.21 秒 | 4/5 通过，learning 失败 | 5 项跳过，0 条命令 |

三次尝试的中位数为 140.59 秒，范围 129.21–159.12 秒；第三轮提前失败，不能据此宣称稳定节省了该耗时。两次完整通过轮次的中位数为 149.85 秒。确定的变化是自动范围不再执行这 5 个脚本，手动入口保留它们。

失败发生在未修改的 3.3.1 基线 `test-native-agent-learning.mjs:139`：`worker.runNext()` 返回 `false`，未满足立即取到任务的断言。前两轮同一脚本通过，因此这里只记录一次不稳定结果，不推断 SDK 根因，也不改断言掩盖失败。原始记录见 [integration.json](integration.json)。

收尾时当前 3.3.2 在 Windows 再次出现该断言失败，随后原脚本在 Linux 隔离容器中通过，见 [integration-learning-linux.json](integration-learning-linux.json)。没有更改脚本断言、重试策略或运行时；Linux 结果不能抹去 Windows 失败记录。

## 安装与旧入口

| 组别 | 基线中位数（范围） | 候选中位数（范围） | 安装包数 | 失败 |
|---|---:|---:|---:|---:|
| Open Notebook 默认 `uv sync --frozen --python 3.12` | 23.23 秒（21.57–36.39） | 8.94 秒（7.54–13.53） | 213→90 | 0/6 |

三轮均用全新虚拟环境，共享逐步填充的 uv 下载缓存；第一轮不是独立冷缓存对照。该数字包含本机安装与磁盘复制成本，不能外推到 Linux CI。未运行测试或构建，测试数与构建次数均为 0。原始记录见 [dependencies.json](dependencies.json)。

Electron 安装包与旧前端构建入口的删除属于维护和依赖收益；未对它们做完整安装包或旧前端镜像计时，不宣称这部分的耗时百分比。原根 CI 未运行的 Open Notebook 旧完整服务/前端测试也不计入原 CI 提速；现在 RAG 相关变化会运行保留的 116 个 Python 测试。

## 删减与保留

- 删除 7 个 Web 源码布局、模块位置、文案或退役存在性测试文件；将混合文件中的焦点恢复、标签、CAPTCHA、权限、确认、消息已读和知识范围检查保留。
- 服务端模块结构扫描收敛为认证/授权边界检查；Canvas 与 ContextThread 保留租户、项目及学习权限约束。
- 默认 Web 测试 73→61，默认 Server 测试 80→74。未进入默认清单的删减仅计维护收益，不计入这两项提速。
- Open Notebook 删除 41 个旧完整服务或重复静态测试文件和 23 个旧前端测试，保留 8 个 RAG/共享 Python 测试文件。完整前端源码作为上游参考保留，无构建/测试入口。
- 删除 Electron 安装包命令、electron-builder、准备脚本和专用配置；开发窗口与 `electron:dev/start` 保留。Node 锁文件条目 1,780→1,506，无新增包版本。
- 删除 Open Notebook regular/single 的镜像、Compose、Makefile 和发布/测试入口。最终默认镜像为 `lingxiloop-rag`；默认安装组为 RAG+dev，原 full/notebooks 依赖组只保留为显式上游参考选项。
- [changed-files.tsv](changed-files.tsv) 列出本次候选快照的修改和删除文件；不包括其他任务的运行时升级。

此外，容器验证修正了 RAG Docker 健康检查的 Supervisor socket 路径，与实际 `/tmp/supervisor.sock` 配置一致。

## 自动覆盖变化

| 情况 | 检查与构建 | 发布 |
|---|---|---|
| 测试文件变化 | 所属检查；补跑默认清单之外的改动测试 | 无 |
| 集成测试变化 | 所改文件；公共 helper/runner 变化跑常规全集 | 无 |
| CI 配置变化 | 范围与部署契约检查 | 无 |
| 部署 Compose 变化 | 部署契约；允许现有部署配置流程 | 不重建无关镜像 |
| PR / 普通手动组件验证 | 在 checks 构建所属 Web/Admin | 无 |
| main 产品源码变化 | Web 在 Docker 构建一次；Admin 在部署任务构建一次，先于 D1 | 仅所属产物 |
| 手动 deep-integration | 常规集成、Redis 重启、documents/canvas/learning/eval 四组空库 Worker | 无 |
| 普通 PR、push、release | 所属变更触发常规集成时保留该门禁，跳过上述五项重型实验 | 保留检查失败/取消阻断 |

重型实验移出自动 CI 是覆盖频率变化，不是测试本身提速；跳过阶段不记为通过。每次 runtime 重要变更仍应手动运行 deep-integration。

## 验收

| 检查 | 最终结果 |
|---|---|
| Web / Admin / Server / Control lint | 均通过；既有警告未做无关清理 |
| Web / Admin 类型检查与构建 | 三轮构建对照均通过；本地 build 的类型检查语义保留 |
| Server / Control 类型检查 | 通过 |
| Web / Server 默认测试 | 61 / 74，通过 |
| 修改的非默认 Server 测试 | 与默认清单合计 77，通过 |
| 修改的 Web 混合测试最终复核 | 5 个文件、17 项，通过 |
| Admin / Control 测试 | 8 / 12，通过；Control 在 Linux 复核 |
| CI 路径、发布门禁与选择器 | 17 项通过；actionlint 通过 |
| RAG Python | 116 项通过；ruff 与 `uv lock --check` 通过 |
| RAG 默认镜像 | 构建通过；最小内容、缺少密码拒绝启动、Supervisor 与 7 项 HTTP 启动契约通过 |
| 隔离 PostgreSQL / Redis 常规集成 | 本地两次运行未完成；3.3.2 对应远端完整集成为 158 通过、1 跳过、0 失败；组合发布重新执行完整 CI |

验证记录见 [verification.json](verification.json)、[rag-image.json](rag-image.json) 和 [integration-current.json](integration-current.json)。记录保留首次失败及最终复核，不把首次失败改写成通过。

- Control 在 Windows 首次执行遇到 Miniflare 隔离存储的 SQLite 文件占用错误；使用相同候选锁文件，在 Linux Node 22 容器、原测试配置上复核 12/12 通过，没有关闭隔离存储。参见 [Cloudflare 已知问题](https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#isolated-storage)。
- 初次固定 3.3.1 的常规集成被本地实验脚本的 600 秒上限终止，缺少完整 TAP 汇总，记为未完成。后续 3.3.2 的本地运行在会话中断时结束，已完成 113 个子测试，但没有最终 TAP 汇总，同样记为未完成。相同运行时升级的 [Linux CI 集成任务](https://github.com/LingXi-Org/LingxiLoop/actions/runs/35512994686/job/106084111797) 完整通过（含五项重型脚本）；该次整个工作流因 Cloudflare 凭据缺失而失败，不能称为发布成功。
- RAG 启动验证使用独立 SurrealDB 与对象存储；未调用真实模型。常规集成未启用 `RESEND_LIVE_TEST`，未发送真实邮件。
- 上述消融和本地验证的数据库、容器均为隔离测试资源，没有执行生产部署、远程 D1 迁移、镜像推送或 Komodo rollout。

## 组合发布收尾

当前全部 Web 改动（含审批、附件、投票、画布与演示卡片）的所属 lint、81 项测试、类型检查及构建通过。附件标签的旧源码断言已随组件提取更新位置。CI 契约与选择器 17 项通过，actionlint 通过。

发布前核对到 GitHub 仓库已迁入 `LingXi-Org`，清单更新脚本现会使用实际发布组织更新所选镜像的命名空间，并保留加速器前缀和未重建镜像；已有测试补充覆盖该情况。Komodo 和 Cloudflare 身份通过 Sigillo prod 核实，三个受影响 Compose 完成本地结构校验。GitHub Actions 缺少部署凭据的限制仍需通过授权的 Sigillo 运维流程完成交付，不能以镜像发布成功代替生产部署成功。

### 2026-09-21 发布验证

- 产品提交 `6ae991549592f037c8df33feb8b00054623c718c`；镜像清单提交 `86d1e3f`。
- [本次 CI](https://github.com/LingXi-Org/LingxiLoop/actions/runs/35562472617) 的 checks、integration、两个镜像发布及清单更新通过。常规集成 159 项：158 通过、1 跳过、0 失败。五项重型脚本按新默认范围跳过，不记为通过。
- GitHub 部署任务缺少 `CLOUDFLARE_API_TOKEN`；本地通过 Sigillo prod 发布 Admin/Control，Worker 版本 `7f26610e-2225-44a4-bebd-a60a85d3c10d`，100% 流量，新页面资源及健康接口核验通过。
- 首次 Komodo 操作 `6ab0bb5bd8838102d0f3e238` 虽完成，但实际仍使用旧仓库路径对应的旧清单，不能作为本次版本交付证据。已用 `72afa2e` 将资源声明中的本仓库迁至 `LingXi-Org/LingxiLoop`，保留现有加速器，并通过官方 CLI 更新资源同步来源。16 项部署契约检查通过；该提交 CI checks 通过，rollout 因 GitHub 缺少 Komodo 凭据失败，随后通过 Sigillo 重启有序部署。
- 发布提交之后其他工作继续产生的会话功能编辑留在工作区，不属于上述已验证发布快照。
- 最终 Komodo 更新 [`6ab0bc72d8838102d0f3e27d`](https://ops.christmas1314.xyz/updates/6ab0bc72d8838102d0f3e27d) 已达到 `Complete`、`success: true`。应用 A/B 的 API、Worker 以及 RAG 均运行 `6ae9915` 镜像且健康，两台 `db-migrate` 均退出 0；SurrealDB 与网关健康。公网 `/api/meta` 返回完整发布提交及 LingxiOS `3.3.2`，产品和 Admin `/api/health` 均返回 `ok: true`。
