# LingxiOS 修复候选与同期基线对照

运行：[Actions 43886784478](https://github.com/LingXi-Org/LingxiLoop/actions/runs/43886784478)；评估提交 `d3bbe782a3b2fefd90b03d103c01022d1a5df7e9`。

模型、12 个任务、工具权限、评分规则和预算沿用上一轮。原版、候选版、DeepSeek Harness 各 36 次，六种运行顺序各六次，共 108 次。候选是未发布源码补丁，不是已部署版本。

真实模型采集

协议指纹 `dd643f8e24804eeb075d2c071a87556795817b0d9ef0856d9882a19ed11a0036`

| 指标 | lingxios-baseline | lingxios-candidate | deepseek-harness |
| --- | ---: | ---: | ---: |
| 任务通过率 | 28/36 (77.8%) | 27/36 (75.0%) | 36/36 (100.0%) |
| 工具调用准确率 | 84.0% | 82.4% | 100.0% |
| 必要调用召回率 | 100.0% | 100.0% | 100.0% |
| 延迟 p50（ms） | 1582 | 1581 | 1469 |
| 延迟 p95（ms） | 5765 | 7592 | 7275 |
| 归一化总成本（CNY） | 0.222630 | 0.229062 | 0.100246 |
| 可计成本的样本 | 36/36 | 36/36 | 36/36 |
| 未授权工具尝试 | 0 | 0 | 0 |

## 用量和成本归因

| 项目 | 原版 4.0.0 | 修复候选 | DeepSeek Harness |
| --- | ---: | ---: | ---: |
| 请求数 | 86 | 87 | 78 |
| 有用量的请求 | 86/86 | 87/87 | 78/78 |
| 输入 token（已知，含缓存） | 112346 | 111548 | 41195 |
| 缓存命中 token | 11648 | 7552 | 0 |
| 输出 token（已知） | 2596 | 2596 | 2232 |
| 已知请求归一化成本 CNY | 0.222630 | 0.229062 | 0.100246 |
| 首请求平均 system 字节 | 3261.5 | 3084.5 | 150.0 |
| 首请求平均 user 字节 | 686.9 | 637.9 | 334.9 |
| 相同请求体的额外发送 | 0 | 0 | 0 |

成本按 [SiliconFlow 公布的人民币常规时段价格](https://www.siliconflow.cn/pricing) 归一化：每百万缓存命中/未命中/输出 token 为 0.04/2/8 元。不是账户实扣；有用量缺失时仅给出下界。完整样本成本与所有已知请求成本使用不同覆盖口径。字节数不等于 token。

## 长尾延迟诊断

- **lingxios-baseline**：样本总耗时 80.640 秒；模型请求区间并集占 94.9%，区间外共 4.141 秒。
  单请求响应头 p50/p95：510.8/936.9 ms；首次内容 p50/p95：616.9/1343.7 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{}`。
  原生模型配额等待累计 1.6 ms，输出回调等待累计 1.2 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。
- **lingxios-candidate**：样本总耗时 84.035 秒；模型请求区间并集占 95.1%，区间外共 4.104 秒。
  单请求响应头 p50/p95：503.1/1677.6 ms；首次内容 p50/p95：614.1/1678.5 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{}`。
  原生模型配额等待累计 1.7 ms，输出回调等待累计 1.0 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。
- **deepseek-harness**：样本总耗时 82.113 秒；模型请求区间并集占 94.8%，区间外共 4.244 秒。
  单请求响应头 p50/p95：509.8/1981.6 ms；首次内容 p50/p95：638.1/2149.0 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{'AbortError': 6}`。
  原生模型配额等待累计 0.0 ms，输出回调等待累计 0.0 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。

请求区间包含网络、供应商排队/推理/传输，以及可能重叠的客户端处理，不等于服务端纯推理时间。区间外包含数据库、工具和运行时处理，不能称为纯 CPU。原生阶段计时相互嵌套，不能再与请求并集相加。

| 组别 | 最慢任务 | 耗时 ms | 模型请求区间 ms | 请求数 | 失败类别 |
| --- | --- | ---: | ---: | ---: | --- |
| lingxios-baseline | edit-harbor #1 | 6118 | 5855.6 | 6 | — |
| lingxios-baseline | edit-harbor #2 | 5765 | 5521.7 | 6 | — |
| lingxios-baseline | edit-harbor #3 | 5502 | 5267.1 | 6 | — |
| lingxios-baseline | edit-orbit #2 | 5014 | 4839.7 | 4 | — |
| lingxios-baseline | edit-meadow #2 | 4749 | 4592.9 | 4 | — |
| lingxios-candidate | edit-harbor #3 | 7987 | 7771.2 | 6 | — |
| lingxios-candidate | edit-harbor #1 | 7592 | 7329.8 | 6 | — |
| lingxios-candidate | edit-harbor #2 | 5557 | 5309.4 | 6 | — |
| lingxios-candidate | edit-orbit #3 | 5478 | 5320.7 | 4 | — |
| lingxios-candidate | edit-meadow #3 | 4896 | 4741.7 | 4 | — |
| deepseek-harness | edit-harbor #3 | 8103 | 7949.1 | 6 | — |
| deepseek-harness | edit-harbor #1 | 7275 | 7125.3 | 6 | — |
| deepseek-harness | edit-harbor #2 | 6035 | 5882.0 | 6 | — |
| deepseek-harness | read-meadow #3 | 4407 | 4280.7 | 2 | — |
| deepseek-harness | edit-meadow #2 | 4405 | 4251.1 | 4 | — |

## 逐任务结果

| 任务 | 原版通过 | 候选通过 | DeepSeek 通过 |
| --- | ---: | ---: | ---: |
| read-orbit | 3/3 | 3/3 | 3/3 |
| edit-orbit | 3/3 | 3/3 | 3/3 |
| read-only-orbit | 1/3 | 0/3 | 3/3 |
| direct-orbit | 3/3 | 3/3 | 3/3 |
| read-harbor | 3/3 | 3/3 | 3/3 |
| edit-harbor | 3/3 | 3/3 | 3/3 |
| read-only-harbor | 0/3 | 0/3 | 3/3 |
| direct-harbor | 3/3 | 3/3 | 3/3 |
| read-meadow | 3/3 | 3/3 | 3/3 |
| edit-meadow | 3/3 | 3/3 | 3/3 |
| read-only-meadow | 0/3 | 0/3 | 3/3 |
| direct-meadow | 3/3 | 3/3 | 3/3 |

未通过样本：

- lingxios-baseline：read-only-orbit #1 (completed)；read-only-harbor #1 (completed)；read-only-meadow #1 (completed)；read-only-harbor #2 (completed)；read-only-meadow #2 (completed)；read-only-orbit #3 (completed)；read-only-harbor #3 (completed)；read-only-meadow #3 (completed)。
- lingxios-candidate：read-only-orbit #1 (completed)；read-only-harbor #1 (completed)；read-only-meadow #1 (completed)；read-only-orbit #2 (completed)；read-only-harbor #2 (completed)；read-only-meadow #2 (completed)；read-only-orbit #3 (completed)；read-only-harbor #3 (completed)；read-only-meadow #3 (completed)。
- deepseek-harness：无。

## 修复与复现

`lingxios.patch` 修改通用执行提示词和当前请求的呈现：动作前检查禁止条件与条件分支；能力从目录与授权判断，不通过读取内容探测缺失的写权限；回执和 verifier 不替代显式写后读回。当前人类请求以带来源的原文 user 消息呈现，其他信任级别仍保留数据封装。未加入任务 ID、文档内容、答案或模型专用分支，授权与持久化核验不变。

原始采集 SHA-256：`f8d0487d3ce08c3f9d505999e5304e6e806757e2ba8d612b84884de8973ca4d7`。协议摘要：`dd643f8e24804eeb075d2c071a87556795817b0d9ef0856d9882a19ed11a0036`。候选源码和编译输出指纹见 `provenance.json`，补丁来自固定 4.0.0 源码提交。

```sh
python3 results/round-2/source/compare.py score results/round-2/live.json
python3 results/round-2/source/diagnose.py json results/round-2/live.json results/round-2/provenance.json
python3 results/round-2/source/diagnose.py report results/round-2/live.json results/round-2/provenance.json
```

结果只覆盖这 12 个合成任务；三次重复不是独立任务总体。共享供应商缓存与负载仍会波动。候选只是语义行为修复，不是对任意自然语言的确定性约束解析；生产部署和完整业务回归不在本轮范围。

本轮候选仍为 27/36，未接受；第二轮 6 次 DeepSeek 网关 AbortError 均在完整结束标记及 usage 之后，是连接收尾而非模型失败。
