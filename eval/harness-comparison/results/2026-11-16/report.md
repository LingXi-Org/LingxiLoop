# LingxiOS 与 DeepSeek Harness 配对评估

真实模型采集

协议指纹 `a2d4b6d184f739469a4dcaa96349b245f41f32f40692e1767d0bbe16c5f5e049`

| 指标 | LingxiOS | DeepSeek Harness |
| --- | ---: | ---: |
| 任务通过率 | 28/36 (77.8%) | 33/36 (91.7%) |
| 工具调用准确率 | 87.0% | 93.3% |
| 必要调用召回率 | 95.2% | 100.0% |
| 延迟 p50（ms） | 2072 | 2918 |
| 延迟 p95（ms） | 43944 | 25210 |
| 归一化总成本（CNY） | — | 0.103768 |
| 可计成本的样本 | 34/36 | 36/36 |
| 未授权工具尝试 | 0 | 0 |

已知请求的归一化成本（包含用量不完整样本中的已知请求）：

- lingxios：**¥0.215585**；2 次请求用量缺失，此值仅为下界。
- deepseek-harness：**¥0.103768**；请求用量完整。

表中的成本覆盖率按完整样本统计，上述补充按请求统计，两者分母不同。

## 执行来源与复现

- 运行：[GitHub Actions 43876938057](https://github.com/LingXi-Org/LingxiLoop/actions/runs/43876938057)。
- 评估提交：`1e9cc9613aa784cf69f2b6e44edb0a9c338b4f67`；版本预检时间：`2026-11-16T13:35:14.010Z`。
- 生产提交：`a26905990ebae50e20b19c013a77bd35db4348c3`；LingxiOS `4.0.0`；DeepSeek Harness `0.2.2-rc.3`。
- 执行平台：`linux/x64`，Node `v24.11.1`；独立 PostgreSQL 16.13。
- 模型：`deepseek-ai/DeepSeek-V4.1-Flash`；路由：`https://api.siliconflow.cn/v1/`。
- 原始采集 SHA-256：`36df2f4f558497c2a6aa34782ea9675699300a476e3f9bef2c2c223126ce2c20`。

下载该运行的 `harness-comparison-*` 工件。评分器及采集代码使用上述评估提交；详细报告渲染器使用本目录的 `build-report.py`。
渲染器 SHA-256：`96b160d92ef4ee171bae1e0cefa1f29f37209bcf3251ca6e2fe50dbde54692c8`。复核命令：

```sh
python3 compare.py score live.json
python3 compare.py report live.json
python3 build-report.py live.json provenance.json
```

重新采集使用 README 的 Sigillo / Actions 入口；无需复制密钥。每次运行保存新文件，不覆盖旧样本。

## 任务与配对结果

| 任务 | LingxiOS 通过 | DeepSeek Harness 通过 |
| --- | ---: | ---: |
| read-orbit | 3/3 | 3/3 |
| edit-orbit | 3/3 | 3/3 |
| read-only-orbit | 3/3 | 2/3 |
| direct-orbit | 3/3 | 3/3 |
| read-harbor | 3/3 | 3/3 |
| edit-harbor | 1/3 | 3/3 |
| read-only-harbor | 0/3 | 3/3 |
| direct-harbor | 3/3 | 3/3 |
| read-meadow | 3/3 | 3/3 |
| edit-meadow | 3/3 | 3/3 |
| read-only-meadow | 0/3 | 1/3 |
| direct-meadow | 3/3 | 3/3 |

36 对样本中：双方通过 27 对，仅 LingxiOS 通过 1 对，仅 DeepSeek Harness 通过 6 对，双方未通过 2 对。
配对延迟差（LingxiOS 减 DeepSeek Harness）的中位数为 97.5 ms；正数表示 LingxiOS 较慢。

## 工具、用量与失败

最终回答与文档终态分别正确 72/72、72/72；任务通过率还要求遵守工具调用约束。

- **lingxios**：工具正确 40/46，必要调用覆盖 40/42；模型请求 84，用量已知 82。
  已知 token：缓存命中 7680，未命中 97955，输出 2421。终态计数：`{'completed': 36}`。
  未通过样本：read-only-harbor#1 (completed)；read-only-meadow#1 (completed)；edit-harbor#2 (completed)；read-only-harbor#2 (completed)；read-only-meadow#2 (completed)；edit-harbor#3 (completed)；read-only-harbor#3 (completed)；read-only-meadow#3 (completed)。
  失败归类：只读拒绝场景多余读取 6 次，修改后漏做显式读回 2 次。
- **deepseek-harness**：工具正确 42/45，必要调用覆盖 42/42；模型请求 81，用量已知 81。
  已知 token：缓存命中 0，未命中 42492，输出 2348。终态计数：`{'completed': 36}`。
  未通过样本：read-only-meadow#1 (completed)；read-only-orbit#2 (completed)；read-only-meadow#2 (completed)。
  失败归类：只读拒绝场景多余读取 3 次，修改后漏做显式读回 0 次。

网关异常计数：`{'AbortError': 4}`；运行时完成 72/72。AbortError 仅表示流被中断，不能单凭该标签推断服务故障或账单金额。缺失用量保留为 null，不通过补跑替换原始样本。

## 解释边界

这是生产发布的 LingxiOS 包与 DeepSeek Harness 的运行循环对照，使用相同的合成文档工具；没有接入生产业务数据库，也没有评估浏览器、终端、记忆、委派或真实业务全流程。
12 个任务各重复 3 次，包括读取、修改与读回、可重现版本冲突、权限拒绝、直接回答。重复样本并非 36 个独立任务，结果仅说明该任务集合上的表现，不据此宣称全面优越或统计显著。
任务通过要求正确终态、精确最终答案和必要工具调用；工具准确率另对名称、参数、结果和顺序评分，重复调用计入分母。超时与失败保留在通过率和延迟分母中。
双方固定 temperature=0、关闭思考与并行调用、最多 1536 输出 token、每样本 90 秒及 8 次模型/工具预算，按配对交替先后顺序执行。网关统一模型可见的工具 schema，运行时原生提示词和循环行为仍然不同。
延迟从运行时已初始化后的任务提交开始，到终态为止，包含模型与工具；不包含进程初始化、依赖安装和清理。p95 采用 nearest-rank，包含失败样本。供应商缓存和外部负载仍可能影响结果。
成本按 [SiliconFlow 公开价格](https://www.siliconflow.cn/pricing) 的人民币常规时段价归一化：每百万缓存命中/未命中/输出 token 分别为 0.04/2/8 元。它不是账户账单；折扣、峰谷时段及未返回用量的请求可能导致差异。用量缺失时全量成本不报告为零。
原方案选择官方 DeepSeek 接口，但既有 Sigillo 凭据实际属于 SiliconFlow。首次真实调用前已重新冻结 v2 协议；旧方案没有真实样本混入。供应商模型别名未暴露不可变权重版本，因此不能保证未来重跑使用完全相同的权重。
