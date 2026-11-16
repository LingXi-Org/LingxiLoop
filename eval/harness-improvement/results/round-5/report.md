# LingxiOS 修复候选与同期基线对照

运行：[Actions 43893558303](https://github.com/LingXi-Org/LingxiLoop/actions/runs/43893558303)；评估提交 `ca4e7f3684c01ddab4a55f3b21c265bb57b68f8c`。

模型、12 个任务、工具权限、评分规则和预算沿用上一轮。原版、候选版、DeepSeek Harness 各 36 次，六种运行顺序各六次，共 108 次。候选是未发布源码补丁，不是已部署版本。

真实模型采集

协议指纹 `08c35996d2832a535ae6e5ec260b4bc9c6d363863309abc6f2a7b1c948d60d92`

| 指标 | lingxios-baseline | lingxios-candidate | deepseek-harness |
| --- | ---: | ---: | ---: |
| 任务通过率 | 28/36 (77.8%) | 33/36 (91.7%) | 35/36 (97.2%) |
| 工具调用准确率 | 85.4% | 89.4% | 97.7% |
| 必要调用召回率 | 97.6% | 100.0% | 100.0% |
| 延迟 p50（ms） | 1659 | 1450 | 1558 |
| 延迟 p95（ms） | 6349 | 9290 | 5874 |
| 归一化总成本（CNY） | 0.224539 | 0.210551 | 0.101418 |
| 可计成本的样本 | 36/36 | 36/36 | 36/36 |
| 未授权工具尝试 | 0 | 5 | 0 |

## 用量和成本归因

| 项目 | 原版 4.0.0 | 修复候选 | DeepSeek Harness |
| --- | ---: | ---: | ---: |
| 请求数 | 84 | 83 | 79 |
| 有用量的请求 | 84/84 | 83/83 | 79/79 |
| 输入 token（已知，含缓存） | 108950 | 103609 | 41621 |
| 缓存命中 token | 6784 | 8320 | 0 |
| 输出 token（已知） | 2492 | 2455 | 2272 |
| 已知请求归一化成本 CNY | 0.224539 | 0.210551 | 0.101418 |
| 首请求平均 system 字节 | 3261.5 | 2356.0 | 150.0 |
| 首请求平均 user 字节 | 686.9 | 637.9 | 334.9 |
| 相同请求体的额外发送 | 0 | 0 | 0 |

成本按 [SiliconFlow 公布的人民币常规时段价格](https://www.siliconflow.cn/pricing) 归一化：每百万缓存命中/未命中/输出 token 为 0.04/2/8 元。不是账户实扣；有用量缺失时仅给出下界。完整样本成本与所有已知请求成本使用不同覆盖口径。字节数不等于 token。

## 长尾延迟诊断

- **lingxios-baseline**：样本总耗时 86.381 秒；模型请求区间并集占 94.6%，区间外共 4.644 秒。
  单请求响应头 p50/p95：522.8/1381.0 ms；首次内容 p50/p95：629.2/1482.3 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{}`。
  其中已收到结束标记及完整用量后的连接收尾 AbortError：0 次；不计为模型失败。
  原生模型配额等待累计 1.6 ms，输出回调等待累计 1.0 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。
- **lingxios-candidate**：样本总耗时 83.733 秒；模型请求区间并集占 94.5%，区间外共 4.580 秒。
  单请求响应头 p50/p95：536.5/1234.1 ms；首次内容 p50/p95：638.3/1408.3 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{}`。
  其中已收到结束标记及完整用量后的连接收尾 AbortError：0 次；不计为模型失败。
  原生模型配额等待累计 1.6 ms，输出回调等待累计 1.0 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。
- **deepseek-harness**：样本总耗时 79.389 秒；模型请求区间并集占 94.1%，区间外共 4.709 秒。
  单请求响应头 p50/p95：509.6/1213.9 ms；首次内容 p50/p95：639.9/1458.0 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{'AbortError': 7}`。
  其中已收到结束标记及完整用量后的连接收尾 AbortError：7 次；不计为模型失败。
  原生模型配额等待累计 0.0 ms，输出回调等待累计 0.0 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。

请求区间包含网络、供应商排队/推理/传输，以及可能重叠的客户端处理，不等于服务端纯推理时间。区间外包含数据库、工具和运行时处理，不能称为纯 CPU。原生阶段计时相互嵌套，不能再与请求并集相加。

| 组别 | 最慢任务 | 耗时 ms | 模型请求区间 ms | 请求数 | 失败类别 |
| --- | --- | ---: | ---: | ---: | --- |
| lingxios-baseline | edit-meadow #3 | 8927 | 8739.7 | 4 | — |
| lingxios-baseline | edit-harbor #1 | 6349 | 6073.6 | 6 | — |
| lingxios-baseline | edit-harbor #2 | 5805 | 5477.8 | 6 | — |
| lingxios-baseline | edit-harbor #3 | 5796 | 5557.4 | 5 | — |
| lingxios-baseline | edit-orbit #2 | 4796 | 4608.3 | 4 | — |
| lingxios-candidate | edit-harbor #1 | 9625 | 9254.5 | 8 | — |
| lingxios-candidate | edit-harbor #3 | 9290 | 8910.1 | 8 | — |
| lingxios-candidate | edit-harbor #2 | 6791 | 6489.4 | 7 | — |
| lingxios-candidate | edit-meadow #3 | 4958 | 4775.3 | 4 | — |
| lingxios-candidate | edit-orbit #3 | 4456 | 4271.7 | 4 | — |
| deepseek-harness | edit-harbor #3 | 10530 | 10367.6 | 6 | — |
| deepseek-harness | edit-harbor #1 | 5874 | 5707.1 | 6 | — |
| deepseek-harness | edit-harbor #2 | 5535 | 5373.5 | 6 | — |
| deepseek-harness | edit-meadow #3 | 4384 | 4238.3 | 4 | — |
| deepseek-harness | edit-orbit #1 | 4362 | 4204.3 | 4 | — |

## 逐任务结果

| 任务 | 原版通过 | 候选通过 | DeepSeek 通过 |
| --- | ---: | ---: | ---: |
| read-orbit | 3/3 | 3/3 | 3/3 |
| edit-orbit | 3/3 | 3/3 | 3/3 |
| read-only-orbit | 1/3 | 3/3 | 3/3 |
| direct-orbit | 3/3 | 3/3 | 3/3 |
| read-harbor | 3/3 | 3/3 | 3/3 |
| edit-harbor | 2/3 | 0/3 | 3/3 |
| read-only-harbor | 0/3 | 3/3 | 2/3 |
| direct-harbor | 3/3 | 3/3 | 3/3 |
| read-meadow | 3/3 | 3/3 | 3/3 |
| edit-meadow | 3/3 | 3/3 | 3/3 |
| read-only-meadow | 1/3 | 3/3 | 3/3 |
| direct-meadow | 3/3 | 3/3 | 3/3 |

未通过样本：

- lingxios-baseline：read-only-orbit #1 (completed)；read-only-harbor #1 (completed)；read-only-orbit #2 (completed)；read-only-harbor #2 (completed)；read-only-meadow #2 (completed)；edit-harbor #3 (completed)；read-only-harbor #3 (completed)；read-only-meadow #3 (completed)。
- lingxios-candidate：edit-harbor #1 (completed)；edit-harbor #2 (completed)；edit-harbor #3 (completed)。
- deepseek-harness：read-only-harbor #2 (completed)。

## 修复与复现

`lingxios.patch` 修改通用执行提示词和当前请求的呈现：动作前检查禁止条件与条件分支；精简重复规则并区分运行时授权上界与实际可调用目录，并显式标明各命名空间的只读状态，能力从目录与授权判断，不通过读取内容探测缺失的写权限；回执和 verifier 不替代显式写后读回。当前人类请求以带来源的原文 user 消息呈现，其他信任级别仍保留数据封装。未加入任务 ID、文档内容、答案或模型专用分支，授权与持久化核验不变。

原始采集 SHA-256：`261a209723d538898af55531d6e60b0ae5fdb355665f7284093acf24259960f9`。协议摘要：`08c35996d2832a535ae6e5ec260b4bc9c6d363863309abc6f2a7b1c948d60d92`。候选源码和编译输出指纹见 `provenance.json`，补丁来自固定 4.0.0 源码提交。

```sh
python3 results/round-5/source/compare.py score results/round-5/live.json
python3 results/round-5/source/diagnose.py json results/round-5/live.json results/round-5/provenance.json
python3 results/round-5/source/diagnose.py report results/round-5/live.json results/round-5/provenance.json
```

结果只覆盖这 12 个合成任务；三次重复不是独立任务总体。共享供应商缓存与负载仍会波动。候选只是语义行为修复，不是对任意自然语言的确定性约束解析；生产部署和完整业务回归不在本轮范围。

补充诊断：本轮使用旧适配器，将版本冲突统一映射为未知失败。第六轮起已纠正；本轮冲突恢复数据只作调试记录，不应解释为完全语义对等的生产运行时比较。
