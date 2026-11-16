# LingxiOS 修复候选与同期基线对照

运行：[Actions 43891230119](https://github.com/LingXi-Org/LingxiLoop/actions/runs/43891230119)；评估提交 `629c9efbb4d8f3f85aecdedccbf5bdc978d56634`。

模型、12 个任务、工具权限、评分规则和预算沿用上一轮。原版、候选版、DeepSeek Harness 各 36 次，六种运行顺序各六次，共 108 次。候选是未发布源码补丁，不是已部署版本。

真实模型采集

协议指纹 `296f5f9d73b43523cde2a0adc323f5ec867403404af1c3f744c349864f17802d`

| 指标 | lingxios-baseline | lingxios-candidate | deepseek-harness |
| --- | ---: | ---: | ---: |
| 任务通过率 | 29/36 (80.6%) | 35/36 (97.2%) | 35/36 (97.2%) |
| 工具调用准确率 | 85.7% | 97.7% | 97.7% |
| 必要调用召回率 | 100.0% | 100.0% | 100.0% |
| 延迟 p50（ms） | 1611 | 1390 | 1503 |
| 延迟 p95（ms） | 9785 | 7457 | 6546 |
| 归一化总成本（CNY） | 0.226265 | 0.199490 | 0.101400 |
| 可计成本的样本 | 36/36 | 36/36 | 36/36 |
| 未授权工具尝试 | 0 | 1 | 0 |

## 用量和成本归因

| 项目 | 原版 4.0.0 | 修复候选 | DeepSeek Harness |
| --- | ---: | ---: | ---: |
| 请求数 | 85 | 79 | 79 |
| 有用量的请求 | 85/85 | 79/79 | 79/79 |
| 输入 token（已知，含缓存） | 111114 | 92429 | 41616 |
| 缓存命中 token | 8320 | 1792 | 0 |
| 输出 token（已知） | 2543 | 2268 | 2271 |
| 已知请求归一化成本 CNY | 0.226265 | 0.199490 | 0.101400 |
| 首请求平均 system 字节 | 3261.5 | 2221.0 | 150.0 |
| 首请求平均 user 字节 | 686.9 | 637.9 | 334.9 |
| 相同请求体的额外发送 | 0 | 0 | 0 |

成本按 [SiliconFlow 公布的人民币常规时段价格](https://www.siliconflow.cn/pricing) 归一化：每百万缓存命中/未命中/输出 token 为 0.04/2/8 元。不是账户实扣；有用量缺失时仅给出下界。完整样本成本与所有已知请求成本使用不同覆盖口径。字节数不等于 token。

## 长尾延迟诊断

- **lingxios-baseline**：样本总耗时 95.221 秒；模型请求区间并集占 95.8%，区间外共 3.991 秒。
  单请求响应头 p50/p95：542.8/2087.3 ms；首次内容 p50/p95：650.5/2229.8 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{}`。
  其中已收到结束标记及完整用量后的连接收尾 AbortError：0 次；不计为模型失败。
  原生模型配额等待累计 1.5 ms，输出回调等待累计 1.0 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。
- **lingxios-candidate**：样本总耗时 92.610 秒；模型请求区间并集占 96.0%，区间外共 3.747 秒。
  单请求响应头 p50/p95：551.2/2334.8 ms；首次内容 p50/p95：695.7/2335.9 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{}`。
  其中已收到结束标记及完整用量后的连接收尾 AbortError：0 次；不计为模型失败。
  原生模型配额等待累计 1.4 ms，输出回调等待累计 0.9 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。
- **deepseek-harness**：样本总耗时 75.780 秒；模型请求区间并集占 94.7%，区间外共 3.996 秒。
  单请求响应头 p50/p95：513.6/1326.3 ms；首次内容 p50/p95：628.5/1679.2 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{'AbortError': 11}`。
  其中已收到结束标记及完整用量后的连接收尾 AbortError：11 次；不计为模型失败。
  原生模型配额等待累计 0.0 ms，输出回调等待累计 0.0 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。

请求区间包含网络、供应商排队/推理/传输，以及可能重叠的客户端处理，不等于服务端纯推理时间。区间外包含数据库、工具和运行时处理，不能称为纯 CPU。原生阶段计时相互嵌套，不能再与请求并集相加。

| 组别 | 最慢任务 | 耗时 ms | 模型请求区间 ms | 请求数 | 失败类别 |
| --- | --- | ---: | ---: | ---: | --- |
| lingxios-baseline | edit-harbor #1 | 11020 | 10775.7 | 6 | — |
| lingxios-baseline | edit-harbor #3 | 9785 | 9549.0 | 6 | — |
| lingxios-baseline | edit-harbor #2 | 9633 | 9386.3 | 6 | — |
| lingxios-baseline | edit-orbit #2 | 4398 | 4228.3 | 4 | — |
| lingxios-baseline | edit-meadow #1 | 4330 | 4137.6 | 4 | — |
| lingxios-candidate | edit-harbor #1 | 11940 | 11642.8 | 7 | — |
| lingxios-candidate | edit-harbor #3 | 7457 | 7248.0 | 6 | — |
| lingxios-candidate | edit-harbor #2 | 7301 | 7058.1 | 6 | — |
| lingxios-candidate | edit-meadow #2 | 6698 | 6548.2 | 4 | — |
| lingxios-candidate | edit-orbit #3 | 6360 | 6205.9 | 4 | — |
| deepseek-harness | edit-orbit #2 | 6825 | 6690.0 | 4 | — |
| deepseek-harness | edit-meadow #1 | 6546 | 6412.9 | 4 | — |
| deepseek-harness | edit-harbor #2 | 5968 | 5824.9 | 6 | — |
| deepseek-harness | edit-harbor #1 | 5649 | 5500.7 | 6 | — |
| deepseek-harness | edit-harbor #3 | 5504 | 5369.9 | 6 | — |

## 逐任务结果

| 任务 | 原版通过 | 候选通过 | DeepSeek 通过 |
| --- | ---: | ---: | ---: |
| read-orbit | 3/3 | 3/3 | 3/3 |
| edit-orbit | 3/3 | 3/3 | 3/3 |
| read-only-orbit | 1/3 | 3/3 | 3/3 |
| direct-orbit | 3/3 | 3/3 | 3/3 |
| read-harbor | 3/3 | 3/3 | 3/3 |
| edit-harbor | 3/3 | 2/3 | 3/3 |
| read-only-harbor | 1/3 | 3/3 | 3/3 |
| direct-harbor | 3/3 | 3/3 | 3/3 |
| read-meadow | 3/3 | 3/3 | 3/3 |
| edit-meadow | 3/3 | 3/3 | 3/3 |
| read-only-meadow | 0/3 | 3/3 | 2/3 |
| direct-meadow | 3/3 | 3/3 | 3/3 |

未通过样本：

- lingxios-baseline：read-only-harbor #1 (completed)；read-only-meadow #1 (completed)；read-only-orbit #2 (completed)；read-only-meadow #2 (completed)；read-only-orbit #3 (completed)；read-only-harbor #3 (completed)；read-only-meadow #3 (completed)。
- lingxios-candidate：edit-harbor #1 (completed)。
- deepseek-harness：read-only-meadow #1 (completed)。

## 修复与复现

`lingxios.patch` 修改通用执行提示词和当前请求的呈现：动作前检查禁止条件与条件分支；精简重复规则并将运行时授权明确为完整 allowlist，能力从目录与授权判断，不通过读取内容探测缺失的写权限；回执和 verifier 不替代显式写后读回。当前人类请求以带来源的原文 user 消息呈现，其他信任级别仍保留数据封装。未加入任务 ID、文档内容、答案或模型专用分支，授权与持久化核验不变。

原始采集 SHA-256：`23b1a42fcd2b326f5bfabcfae504a1bc09a29b521f19dc02669367589c282b66`。协议摘要：`296f5f9d73b43523cde2a0adc323f5ec867403404af1c3f744c349864f17802d`。候选源码和编译输出指纹见 `provenance.json`，补丁来自固定 4.0.0 源码提交。

```sh
python3 results/round-4/source/compare.py score results/round-4/live.json
python3 results/round-4/source/diagnose.py json results/round-4/live.json results/round-4/provenance.json
python3 results/round-4/source/diagnose.py report results/round-4/live.json results/round-4/provenance.json
```

结果只覆盖这 12 个合成任务；三次重复不是独立任务总体。共享供应商缓存与负载仍会波动。候选只是语义行为修复，不是对任意自然语言的确定性约束解析；生产部署和完整业务回归不在本轮范围。
