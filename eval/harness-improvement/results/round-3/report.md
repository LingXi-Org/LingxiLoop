# LingxiOS 修复候选与同期基线对照

运行：[Actions 43889723032](https://github.com/LingXi-Org/LingxiLoop/actions/runs/43889723032)；评估提交 `fb20e99bfe299ea042ff3ab226c268963f64cd9e`。

模型、12 个任务、工具权限、评分规则和预算沿用上一轮。原版、候选版、DeepSeek Harness 各 36 次，六种运行顺序各六次，共 108 次。候选是未发布源码补丁，不是已部署版本。

真实模型采集

协议指纹 `54251efd6de5168daf268406158d589c998e85b9d50aa6027aeafbcc7704800b`

| 指标 | lingxios-baseline | lingxios-candidate | deepseek-harness |
| --- | ---: | ---: | ---: |
| 任务通过率 | 28/36 (77.8%) | 31/36 (86.1%) | 33/36 (91.7%) |
| 工具调用准确率 | 85.4% | 89.4% | 93.3% |
| 必要调用召回率 | 97.6% | 100.0% | 100.0% |
| 延迟 p50（ms） | 1670 | 1467 | 1470 |
| 延迟 p95（ms） | 5869 | 6341 | 6751 |
| 归一化总成本（CNY） | 0.219279 | 0.193070 | 0.103794 |
| 可计成本的样本 | 36/36 | 36/36 | 36/36 |
| 未授权工具尝试 | 0 | 0 | 0 |

## 用量和成本归因

| 项目 | 原版 4.0.0 | 修复候选 | DeepSeek Harness |
| --- | ---: | ---: | ---: |
| 请求数 | 84 | 83 | 81 |
| 有用量的请求 | 84/84 | 83/83 | 81/81 |
| 输入 token（已知，含缓存） | 109105 | 88822 | 42497 |
| 缓存命中 token | 9728 | 2048 | 0 |
| 输出 token（已知） | 2517 | 2430 | 2350 |
| 已知请求归一化成本 CNY | 0.219279 | 0.193070 | 0.103794 |
| 首请求平均 system 字节 | 3261.5 | 1808.5 | 150.0 |
| 首请求平均 user 字节 | 686.9 | 637.9 | 334.9 |
| 相同请求体的额外发送 | 0 | 0 | 0 |

成本按 [SiliconFlow 公布的人民币常规时段价格](https://www.siliconflow.cn/pricing) 归一化：每百万缓存命中/未命中/输出 token 为 0.04/2/8 元。不是账户实扣；有用量缺失时仅给出下界。完整样本成本与所有已知请求成本使用不同覆盖口径。字节数不等于 token。

## 长尾延迟诊断

- **lingxios-baseline**：样本总耗时 82.075 秒；模型请求区间并集占 95.2%，区间外共 3.908 秒。
  单请求响应头 p50/p95：524.2/1077.5 ms；首次内容 p50/p95：640.3/1122.1 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{}`。
  其中已收到结束标记及完整用量后的连接收尾 AbortError：0 次；不计为模型失败。
  原生模型配额等待累计 1.5 ms，输出回调等待累计 1.1 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。
- **lingxios-candidate**：样本总耗时 75.065 秒；模型请求区间并集占 94.8%，区间外共 3.905 秒。
  单请求响应头 p50/p95：498.1/892.0 ms；首次内容 p50/p95：632.2/1102.4 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{}`。
  其中已收到结束标记及完整用量后的连接收尾 AbortError：0 次；不计为模型失败。
  原生模型配额等待累计 1.5 ms，输出回调等待累计 0.9 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。
- **deepseek-harness**：样本总耗时 74.839 秒；模型请求区间并集占 94.5%，区间外共 4.090 秒。
  单请求响应头 p50/p95：498.9/989.6 ms；首次内容 p50/p95：609.5/1224.6 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{'AbortError': 11}`。
  其中已收到结束标记及完整用量后的连接收尾 AbortError：11 次；不计为模型失败。
  原生模型配额等待累计 0.0 ms，输出回调等待累计 0.0 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。

请求区间包含网络、供应商排队/推理/传输，以及可能重叠的客户端处理，不等于服务端纯推理时间。区间外包含数据库、工具和运行时处理，不能称为纯 CPU。原生阶段计时相互嵌套，不能再与请求并集相加。

| 组别 | 最慢任务 | 耗时 ms | 模型请求区间 ms | 请求数 | 失败类别 |
| --- | --- | ---: | ---: | ---: | --- |
| lingxios-baseline | edit-harbor #2 | 6473 | 6249.8 | 6 | — |
| lingxios-baseline | edit-harbor #1 | 5869 | 5624.5 | 6 | — |
| lingxios-baseline | edit-meadow #1 | 5151 | 4996.3 | 4 | — |
| lingxios-baseline | edit-harbor #3 | 4999 | 4790.9 | 5 | — |
| lingxios-baseline | edit-meadow #3 | 4972 | 4826.7 | 4 | — |
| lingxios-candidate | edit-harbor #1 | 6637 | 6368.9 | 6 | — |
| lingxios-candidate | edit-harbor #2 | 6341 | 6099.8 | 6 | — |
| lingxios-candidate | edit-harbor #3 | 5926 | 5691.5 | 6 | — |
| lingxios-candidate | edit-orbit #3 | 5075 | 4934.9 | 4 | — |
| lingxios-candidate | edit-orbit #2 | 4378 | 4211.2 | 4 | — |
| deepseek-harness | edit-harbor #1 | 7253 | 7108.2 | 6 | — |
| deepseek-harness | edit-harbor #2 | 6751 | 6604.6 | 6 | — |
| deepseek-harness | edit-harbor #3 | 5294 | 5149.3 | 6 | — |
| deepseek-harness | edit-orbit #1 | 4398 | 4263.9 | 4 | — |
| deepseek-harness | edit-meadow #2 | 3990 | 3861.7 | 4 | — |

## 逐任务结果

| 任务 | 原版通过 | 候选通过 | DeepSeek 通过 |
| --- | ---: | ---: | ---: |
| read-orbit | 3/3 | 3/3 | 3/3 |
| edit-orbit | 3/3 | 3/3 | 3/3 |
| read-only-orbit | 2/3 | 3/3 | 3/3 |
| direct-orbit | 3/3 | 3/3 | 3/3 |
| read-harbor | 3/3 | 3/3 | 3/3 |
| edit-harbor | 2/3 | 3/3 | 3/3 |
| read-only-harbor | 0/3 | 0/3 | 2/3 |
| direct-harbor | 3/3 | 3/3 | 3/3 |
| read-meadow | 3/3 | 3/3 | 3/3 |
| edit-meadow | 3/3 | 3/3 | 3/3 |
| read-only-meadow | 0/3 | 1/3 | 1/3 |
| direct-meadow | 3/3 | 3/3 | 3/3 |

未通过样本：

- lingxios-baseline：read-only-harbor #1 (completed)；read-only-meadow #1 (completed)；read-only-harbor #2 (completed)；read-only-meadow #2 (completed)；read-only-orbit #3 (completed)；edit-harbor #3 (completed)；read-only-harbor #3 (completed)；read-only-meadow #3 (completed)。
- lingxios-candidate：read-only-harbor #1 (completed)；read-only-harbor #2 (completed)；read-only-meadow #2 (completed)；read-only-harbor #3 (completed)；read-only-meadow #3 (completed)。
- deepseek-harness：read-only-meadow #1 (completed)；read-only-meadow #2 (completed)；read-only-harbor #3 (completed)。

## 修复与复现

`lingxios.patch` 修改通用执行提示词和当前请求的呈现：动作前检查禁止条件与条件分支；精简重复规则并将运行时授权明确为完整 allowlist，能力从目录与授权判断，不通过读取内容探测缺失的写权限；回执和 verifier 不替代显式写后读回。当前人类请求以带来源的原文 user 消息呈现，其他信任级别仍保留数据封装。未加入任务 ID、文档内容、答案或模型专用分支，授权与持久化核验不变。

原始采集 SHA-256：`15c2a6cf4bd8bedfd68dc05cf663b40dfacf5a816900be6ad9dabc9d07bfd7b0`。协议摘要：`54251efd6de5168daf268406158d589c998e85b9d50aa6027aeafbcc7704800b`。候选源码和编译输出指纹见 `provenance.json`，补丁来自固定 4.0.0 源码提交。

```sh
python3 results/round-3/source/compare.py score results/round-3/live.json
python3 results/round-3/source/diagnose.py json results/round-3/live.json results/round-3/provenance.json
python3 results/round-3/source/diagnose.py report results/round-3/live.json results/round-3/provenance.json
```

结果只覆盖这 12 个合成任务；三次重复不是独立任务总体。共享供应商缓存与负载仍会波动。候选只是语义行为修复，不是对任意自然语言的确定性约束解析；生产部署和完整业务回归不在本轮范围。

本轮有改善，但仍有 5 次多余读取，未判定完成修复。
