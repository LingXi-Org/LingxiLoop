# LingxiOS 修复候选与同期基线对照

运行：[Actions 43884342867](https://github.com/LingXi-Org/LingxiLoop/actions/runs/43884342867)；评估提交 `a1702b02fa5c2b2482ca0aee4c1ac3e9ab0cce6d`。

模型、12 个任务、工具权限、评分规则和预算沿用上一轮。原版、候选版、DeepSeek Harness 各 36 次，六种运行顺序各六次，共 108 次。候选是未发布源码补丁，不是已部署版本。

真实模型采集

协议指纹 `a9243c875e170540892e75ce6f90fe79328a195ba452a7f0c4ce8ee77564441b`

| 指标 | lingxios-baseline | lingxios-candidate | deepseek-harness |
| --- | ---: | ---: | ---: |
| 任务通过率 | 29/36 (80.6%) | 27/36 (75.0%) | 36/36 (100.0%) |
| 工具调用准确率 | 87.2% | 82.4% | 100.0% |
| 必要调用召回率 | 97.6% | 100.0% | 100.0% |
| 延迟 p50（ms） | 1527 | 1597 | 1510 |
| 延迟 p95（ms） | 6556 | 6683 | 7148 |
| 归一化总成本（CNY） | 0.217290 | 0.219335 | 0.100234 |
| 可计成本的样本 | 36/36 | 36/36 | 36/36 |
| 未授权工具尝试 | 0 | 0 | 0 |

## 用量和成本归因

| 项目 | 原版 4.0.0 | 修复候选 | DeepSeek Harness |
| --- | ---: | ---: | ---: |
| 请求数 | 83 | 87 | 78 |
| 有用量的请求 | 83/83 | 87/87 | 78/78 |
| 输入 token（已知，含缓存） | 107707 | 108661 | 41189 |
| 缓存命中 token | 9088 | 9728 | 0 |
| 输出 token（已知） | 2461 | 2635 | 2232 |
| 已知请求归一化成本 CNY | 0.217290 | 0.219335 | 0.100234 |
| 首请求平均 system 字节 | 3261.5 | 2805.5 | 150.0 |
| 首请求平均 user 字节 | 686.9 | 686.9 | 334.9 |
| 相同请求体的额外发送 | 0 | 0 | 0 |

成本按 [SiliconFlow 公布的人民币常规时段价格](https://www.siliconflow.cn/pricing) 归一化：每百万缓存命中/未命中/输出 token 为 0.04/2/8 元。不是账户实扣；有用量缺失时仅给出下界。完整样本成本与所有已知请求成本使用不同覆盖口径。字节数不等于 token。

## 长尾延迟诊断

- **lingxios-baseline**：样本总耗时 86.412 秒；模型请求区间并集占 93.8%，区间外共 5.333 秒。
  单请求响应头 p50/p95：530.9/1185.1 ms；首次内容 p50/p95：630.6/1379.5 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{'AbortError': 1}`。
  原生模型配额等待累计 1.5 ms，输出回调等待累计 1.0 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。
- **lingxios-candidate**：样本总耗时 89.098 秒；模型请求区间并集占 94.1%，区间外共 5.254 秒。
  单请求响应头 p50/p95：532.5/1314.9 ms；首次内容 p50/p95：643.9/1316.2 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{}`。
  原生模型配额等待累计 1.6 ms，输出回调等待累计 1.1 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。
- **deepseek-harness**：样本总耗时 75.314 秒；模型请求区间并集占 93.5%，区间外共 4.905 秒。
  单请求响应头 p50/p95：524.8/1357.1 ms；首次内容 p50/p95：643.0/1358.2 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{'AbortError': 6}`。
  原生模型配额等待累计 0.0 ms，输出回调等待累计 0.0 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。

请求区间包含网络、供应商排队/推理/传输，以及可能重叠的客户端处理，不等于服务端纯推理时间。区间外包含数据库、工具和运行时处理，不能称为纯 CPU。原生阶段计时相互嵌套，不能再与请求并集相加。

| 组别 | 最慢任务 | 耗时 ms | 模型请求区间 ms | 请求数 | 失败类别 |
| --- | --- | ---: | ---: | ---: | --- |
| lingxios-baseline | edit-orbit #1 | 7201 | 6988.1 | 4 | — |
| lingxios-baseline | edit-harbor #3 | 6556 | 6188.4 | 6 | — |
| lingxios-baseline | edit-harbor #1 | 6336 | 6053.7 | 6 | — |
| lingxios-baseline | edit-harbor #2 | 5367 | 5136.7 | 5 | — |
| lingxios-baseline | read-only-orbit #1 | 4655 | 4559.3 | 1 | — |
| lingxios-candidate | edit-harbor #3 | 14811 | 14492.8 | 6 | — |
| lingxios-candidate | edit-harbor #2 | 6683 | 6356.1 | 6 | — |
| lingxios-candidate | edit-harbor #1 | 5743 | 5435.4 | 6 | — |
| lingxios-candidate | edit-orbit #1 | 5570 | 5342.0 | 4 | — |
| lingxios-candidate | edit-meadow #1 | 4225 | 4059.6 | 4 | — |
| deepseek-harness | edit-harbor #2 | 7818 | 7630.1 | 6 | — |
| deepseek-harness | edit-harbor #3 | 7148 | 6976.6 | 6 | — |
| deepseek-harness | edit-harbor #1 | 6019 | 5861.8 | 6 | — |
| deepseek-harness | edit-meadow #3 | 4346 | 4109.5 | 4 | — |
| deepseek-harness | edit-orbit #1 | 4196 | 4037.9 | 4 | — |

## 逐任务结果

| 任务 | 原版通过 | 候选通过 | DeepSeek 通过 |
| --- | ---: | ---: | ---: |
| read-orbit | 3/3 | 3/3 | 3/3 |
| edit-orbit | 3/3 | 3/3 | 3/3 |
| read-only-orbit | 2/3 | 0/3 | 3/3 |
| direct-orbit | 3/3 | 3/3 | 3/3 |
| read-harbor | 3/3 | 3/3 | 3/3 |
| edit-harbor | 2/3 | 3/3 | 3/3 |
| read-only-harbor | 1/3 | 0/3 | 3/3 |
| direct-harbor | 3/3 | 3/3 | 3/3 |
| read-meadow | 3/3 | 3/3 | 3/3 |
| edit-meadow | 3/3 | 3/3 | 3/3 |
| read-only-meadow | 0/3 | 0/3 | 3/3 |
| direct-meadow | 3/3 | 3/3 | 3/3 |

未通过样本：

- lingxios-baseline：read-only-meadow #1 (completed)；edit-harbor #2 (completed)；read-only-harbor #2 (completed)；read-only-meadow #2 (completed)；read-only-orbit #3 (completed)；read-only-harbor #3 (completed)；read-only-meadow #3 (completed)。
- lingxios-candidate：read-only-orbit #1 (completed)；read-only-harbor #1 (completed)；read-only-meadow #1 (completed)；read-only-orbit #2 (completed)；read-only-harbor #2 (completed)；read-only-meadow #2 (completed)；read-only-orbit #3 (completed)；read-only-harbor #3 (completed)；read-only-meadow #3 (completed)。
- deepseek-harness：无。

## 修复与复现

`lingxios.patch` 只修改通用提示词：动作前检查禁止条件和条件分支；授权不代表必须调用；回执和 verifier 不替代显式写后读回；每次最终回复检查所有要求，并精简重复说明。未加入任务 ID、文档内容、答案或模型专用分支，授权与持久化核验不变。

原始采集 SHA-256：`82e7a1972d88af93e1a126833362e15cf16c14ec77e202717067c0e6eab0cc60`。协议摘要：`a9243c875e170540892e75ce6f90fe79328a195ba452a7f0c4ce8ee77564441b`。候选源码和编译输出指纹见 `provenance.json`，补丁来自固定 4.0.0 源码提交。

```sh
python3 results/round-1/source/compare.py score results/round-1/live.json
python3 results/round-1/source/diagnose.py json results/round-1/live.json results/round-1/provenance.json
python3 results/round-1/source/diagnose.py report results/round-1/live.json results/round-1/provenance.json
```

结果只覆盖这 12 个合成任务；三次重复不是独立任务总体。共享供应商缓存与负载仍会波动。候选只是语义行为修复，不是对任意自然语言的确定性约束解析；生产部署和完整业务回归不在本轮范围。

本轮候选未达到回归要求（27/36），未接受。后续轮次不覆盖本轮。
