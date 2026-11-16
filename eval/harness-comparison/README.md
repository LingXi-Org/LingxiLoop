# LingxiOS 与 DeepSeek Harness 配对评估

## 2026-11-16 验证状态

已启动独立的 Colima profile `harness-eval`。PostgreSQL 16.13 容器 `harness-eval-postgres` 健康，监听 `127.0.0.1:55438`。评估入口只连接该库，首次运行用 LingxiOS 包内的公开 schema 初始化。

**已完成 72/72 次真实模型采集与完整评分**，且此前正式发布包的 72/72 次替身检查通过。[完整报告](results/2026-11-16/report.md) · [原始记录](results/2026-11-16/live.json) · [指标](results/2026-11-16/metrics.json) · [成功运行](https://github.com/LingXi-Org/LingxiLoop/actions/runs/43876938057)。

LingxiOS 任务通过 28/36，DeepSeek Harness 33/36；工具调用准确率分别为 87.0% 和 93.3%。双方最终回答与文档终态均正确，差异来自多余读取和漏做读回校验。LingxiOS 的两次请求用量缺失，完整总成本不可确定；已知请求的归一化成本下界为 ¥0.215585，DeepSeek Harness 为 ¥0.103768。报告保留这项限制，没有补跑替换样本。

本轮运行在 GitHub Actions 的独立 PostgreSQL 中，使用现有 GitHub Secrets 和 Sigillo 注入；本机 Colima 用于入口复验。模型在第一次真实调用前冻结为 Sigillo 已配置的 SiliconFlow DeepSeek-V4.1-Flash。九项代码与依赖哈希已与采集来源逐项一致核对，本地重新评分与 CI 指标完全一致。

线上 [版本端点](https://loop.lingxilearn.cn/api/meta) 返回 LingxiLoop 提交 `a26905990ebae50e20b19c013a77bd35db4348c3` 和 LingxiOS 4.0.0。安装锁引用该 [生产提交的包地址及校验值](https://github.com/LingXi-Org/LingxiLoop/blob/a26905990ebae50e20b19c013a77bd35db4348c3/server/package-lock.json)。DeepSeek Harness 固定为 [0.2.2-rc.3 的官方源码提交](https://github.com/deepseek-ai/deepseek-harness/tree/39163dd30f703a79079e2d2446545cff3c453738)。

## 凭据与运行

优先复用已保存的云端环境或 Sigillo，不再要求手工创建密钥文件。已核实 GitHub 仓库存在 `SIGILLO_TOKEN` 和 `LINGXIOS_PACKAGES_TOKEN`，现有部署工作流使用 `https://sigillo.lingxilearn.cn` 的项目 `01M1TZH9C21C1A9PFAR8E41553`、环境 `prod`。GitHub Secrets 不支持读回，只能在授权的 Actions 任务内注入。

新增 [隔离评估工作流](../../.github/workflows/harness-comparison.yml) 仅在 `eval/harness-comparison-*` 分支运行，不部署、不合并主分支。发布包使用既有包读取 token，真实评估通过 Sigillo 在内存中注入已有配置。已核实已有 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 和 `OPENAI_MODEL`。v2 协议在首次真实调用前固定为 SiliconFlow 的 `deepseek-ai/DeepSeek-V4.1-Flash`，入口严格核对域名、路径和模型名称后才使用密钥；匹配失败即停止。原官方 DeepSeek v1 协议保存在 `protocol-official-deepseek-v1.json`，未产生真实样本，不与 v2 混合。

工作流完成 72 次替身检查后，核对生产版本和固定供应商模型目录，再执行 72 次真实采集。工件保存 `live.json`、逐条日志、`metrics.json`、`report.md` 与包含代码哈希的 `provenance.json`。失败只保留已有记录，不生成完整对照结果。

已有云端环境可直接运行 `node with-secrets.mjs install` 和 `node with-secrets.mjs live .state/live.json`。已有 Sigillo 登录或 token 的环境可用：

```sh
SIGILLO_API_URL=https://sigillo.lingxilearn.cn npm exec --yes --package=sigillo@0.14.2 -- \
  sigillo run -p 01M1TZH9C21C1A9PFAR8E41553 -c prod -- node with-secrets.mjs install
SIGILLO_API_URL=https://sigillo.lingxilearn.cn npm exec --yes --package=sigillo@0.14.2 -- \
  sigillo run -p 01M1TZH9C21C1A9PFAR8E41553 -c prod -- node preflight.mjs
SIGILLO_API_URL=https://sigillo.lingxilearn.cn npm exec --yes --package=sigillo@0.14.2 -- \
  sigillo run -p 01M1TZH9C21C1A9PFAR8E41553 -c prod -- node with-secrets.mjs live .state/live.json
```

`with-secrets.mjs` 仅向评估子进程传入模型密钥及基础进程变量，不继承 Sigillo、SSH、生产数据库或其他供应商密钥。不会将任何密钥写入文件。

Colima、端口和数据库名都已固定，无需在凭据文件里提供数据库配置。重建环境时可运行以下命令。若同名容器已存在，启动现有容器。

```sh
colima start --profile harness-eval --cpu 2 --memory 3 --disk 16 --runtime docker --activate=false
docker --context colima-harness-eval run -d --name harness-eval-postgres \
  --restart unless-stopped -p 127.0.0.1:55438:5432 \
  -e POSTGRES_USER=harness_eval -e POSTGRES_PASSWORD=harness-eval-local-only \
  -e POSTGRES_DB=harness_eval --health-cmd 'pg_isready -U harness_eval -d harness_eval' \
  --health-interval 2s --health-retries 20 \
  postgres:16.13@sha256:5d143123fdf80462d1778cd4f24b9f7ca13c87174bca19141fb194c5a1ebca59
docker --context colima-harness-eval inspect -f '{{.State.Health.Status}}' harness-eval-postgres
```

使用 Node 24.9+ 和 Python 3，从本目录运行：

```sh
node with-secrets.mjs install
node with-secrets.mjs smoke .state/smoke.json
node with-secrets.mjs live .state/live.json
python3 compare.py score .state/live.json > .state/metrics.json
python3 compare.py report .state/live.json > .state/report.md
```

每次使用新的输出文件名。采集器逐样本追加同名 `.jsonl`，全部配对完成后写 JSON。若遇到认证或额度错误会提前停止并保留采集日志。真实运行校验实际安装包的地址和完整性；冒烟模式完全走本地模型替身。两个运行时都用公开入口，DeepSeek 使用 SDK minimal 的原生函数执行器和官方 OpenAI 兼容适配插件。共享网关将真实请求的工具清单、模型和采样参数固定到协议值，并记录供应商返回的用量。LingxiOS 内置的通用任务辅助工具从模型可见列表移除，双方的文档读写由同一隔离夹具执行。

## 固定条件

- 两边都走 SiliconFlow Chat Completions，模型 `deepseek-ai/DeepSeek-V4.1-Flash`，复用 Sigillo 已有生产配置。供应商未公开不可变权重版本，重跑时核对目录并保留日期。通过 `enable_thinking: false` 关闭思考，并关闭并行工具调用，temperature 0，输出最多 1536 tokens。这个选择固定了两个 Harness 的共同模型，生产配置的主模型可能不同。[模型和价格](https://www.siliconflow.cn/pricing)
- 12 个任务，每个重复 3 次，每次对两边使用相同用户输入、共享指令和新会话。每对串行执行，36 对中各有 18 对先跑对应的 Harness。每样本总时限 90 秒，最多 8 次模型请求、8 次工具尝试。
- 任务涵盖读取、带版本写入和读回校验、一次可复现的并发冲突、只读用户提出写入请求、以及无需工具的直接回答。每个样本使用新的内存文档状态。写入权限、资源 ID、schema、结果和并发事件相同。
- 目标是比较两个固定版本的运行循环及其原生提示词、工具验证和恢复行为。使用生产发布的 LingxiOS 包，业务工具换成同一组合成文档工具。评估范围是这些共同任务。真实业务数据库、外部工具、浏览器、终端、记忆和委派均不在范围内。

## 离线复核

从仓库根目录运行：

```sh
python3 eval/harness-comparison/compare.py manifest > /tmp/harness-manifest.json
python3 eval/harness-comparison/compare.py fixture read-orbit <<'JSON'
{"tool":"document__read","args":{"id":"orbit"}}
JSON
python3 eval/harness-comparison/compare.py score /tmp/harness-capture.json > /tmp/harness-metrics.json
```

前两条命令可独立运行。第三条需要采集完成的 72 条记录，输出保留采集类型。Manifest 包含答案和评分规则。每个运行只给模型共享指令、该任务的用户输入、获授权的工具描述及实际执行返回值。

两边利用各自公开工具扩展入口，将模型可见的工具映射到 `fixture TASK_ID` 的独立进程。每次传入一行 `{"tool":"...","args":{...}}`，读取一行带 `outcome` 的响应。关闭 stdin 后获得 `finalState`。直接从模型响应记录工具尝试，包括被权限层或 schema 拒绝的尝试。对照模型请求实际发送的工具清单和模型参数。DeepSeek 使用原生函数调用配置，禁用默认业务工具及会话日志上传。[DeepSeek 工具注册文档](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/core/tools/README.md)

采集文件为 JSON，顶层复制 manifest 的 `protocolSha256`、`runtimes` 和 `model`，按 `runOrder` 填写 `rows`。每行包含：

| 字段 | 定义 |
| --- | --- |
| `task`、`repeat`、`runtime` | 按 manifest 的次序和标签写入。 |
| `status` | `completed`、`timeout`、`runtime-error` 或 `budget-exceeded`。 |
| `latencyMs` | 预热后从样本提交到终态的单调时钟耗时，包含模型和工具。 |
| `answer`、`finalState` | 最终公开回答及独立读取的文档终态。失败时回答可留空。 |
| `toolAttempts` | 按序记录 `tool`、原始 `args` 和 `outcome`。正常响应、权限拒绝和参数拒绝分别记为 `ok`、`denied` 和 `invalid`，并发写入冲突记为 `conflict`。 |
| `providerUsage` | 按请求记录供应商返回的 `cacheHit`、`cacheMiss`、`output` token 数。任何已发请求的用量缺失时该项记为 `null`。只有确认未发请求才记空数组。 |

通过率使用全部 36 次作为每边分母。工具准确率按正确的名称、参数和顺序计算，分母包括重复、错误和越权尝试。另报必要调用召回率，避免漏调提高准确率。延迟含失败样本，报告 p50/p95。成本按统一人民币常规时段单价归一化（每百万 token：缓存命中 0.04 元、未命中 2 元、输出 8 元），分别计缓存命中、未命中和输出 tokens，涵盖重试用量。成本覆盖率随结果一起给出，缺失用量时全量总成本为空。该价格口径用于横向比较，供应商的实际扣款取决于请求时段。[供应商计价](https://www.siliconflow.cn/pricing)

已用本地模型替身和离线记录验证评分路径，包括重复调用、越权、超时、用量缺失及缺行拒绝。正式发布包的安装和真实供应商的采集由上述 Actions 工作流使用现有 Secrets 验证。
