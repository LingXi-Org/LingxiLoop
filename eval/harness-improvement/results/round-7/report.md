# LingxiOS 修复候选与同期基线对照

运行：[Actions 43897103735](https://github.com/LingXi-Org/LingxiLoop/actions/runs/43897103735)；评估提交 `6eea76bd5868a96ae62c47b0fd7932769025903d`。

模型、12 个任务、工具权限、评分规则和预算沿用上一轮。原版、候选版、DeepSeek Harness 各 36 次，六种运行顺序各六次，共 108 次。候选是未发布源码补丁，不是已部署版本。

真实模型采集

协议指纹 `ceeef0039f40d228206e423dc0a399ce4baca76b520aaed01190364011ac4247`

| 指标 | lingxios-baseline | lingxios-candidate | deepseek-harness |
| --- | ---: | ---: | ---: |
| 任务通过率 | 27/36 (75.0%) | 36/36 (100.0%) | 36/36 (100.0%) |
| 工具调用准确率 | 82.4% | 100.0% | 100.0% |
| 必要调用召回率 | 100.0% | 100.0% | 100.0% |
| 延迟 p50（ms） | 1700 | 1444 | 1097 |
| 延迟 p95（ms） | 6682 | 7500 | 5630 |
| 归一化总成本（CNY） | 0.230090 | 0.180781 | 0.100236 |
| 可计成本的样本 | 36/36 | 36/36 | 36/36 |
| 未授权工具尝试 | 0 | 0 | 0 |

## 用量和成本归因

| 项目 | 原版 4.0.0 | 修复候选 | DeepSeek Harness |
| --- | ---: | ---: | ---: |
| 请求数 | 87 | 78 | 78 |
| 有用量的请求 | 87/87 | 78/78 | 78/78 |
| 输入 token（已知，含缓存） | 113670 | 82968 | 41190 |
| 缓存命中 token | 9344 | 1536 | 0 |
| 输出 token（已知） | 2633 | 2232 | 2232 |
| 已知请求归一化成本 CNY | 0.230090 | 0.180781 | 0.100236 |
| 首请求平均 system 字节 | 3261.5 | 1804.5 | 150.0 |
| 首请求平均 user 字节 | 686.9 | 637.9 | 334.9 |
| 相同请求体的额外发送 | 0 | 0 | 0 |

成本按 [SiliconFlow 公布的人民币常规时段价格](https://www.siliconflow.cn/pricing) 归一化：每百万缓存命中/未命中/输出 token 为 0.04/2/8 元。不是账户实扣；有用量缺失时仅给出下界。完整样本成本与所有已知请求成本使用不同覆盖口径。字节数不等于 token。

## 长尾延迟诊断

- **lingxios-baseline**：样本总耗时 84.789 秒；模型请求区间并集占 95.0%，区间外共 4.222 秒。
  单请求响应头 p50/p95：494.9/1059.0 ms；首次内容 p50/p95：589.3/1150.7 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{}`。
  其中已收到结束标记及完整用量后的连接收尾 AbortError：0 次；不计为模型失败。
  原生模型配额等待累计 1.7 ms，输出回调等待累计 1.1 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。
- **lingxios-candidate**：样本总耗时 74.623 秒；模型请求区间并集占 94.8%，区间外共 3.912 秒。
  单请求响应头 p50/p95：472.3/1670.9 ms；首次内容 p50/p95：592.0/1671.7 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{}`。
  其中已收到结束标记及完整用量后的连接收尾 AbortError：0 次；不计为模型失败。
  原生模型配额等待累计 1.5 ms，输出回调等待累计 1.0 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。
- **deepseek-harness**：样本总耗时 71.719 秒；模型请求区间并集占 94.2%，区间外共 4.184 秒。
  单请求响应头 p50/p95：475.9/1806.8 ms；首次内容 p50/p95：591.1/1810.2 ms。
  原生 ledger 重试 0 次，失败分类 `{}`；网关异常 `{'AbortError': 9}`。
  其中已收到结束标记及完整用量后的连接收尾 AbortError：9 次；不计为模型失败。
  原生模型配额等待累计 0.0 ms，输出回调等待累计 0.0 ms。DeepSeek 没有采集其内部 ledger，不能将零计数解读为不存在内部开销。

请求区间包含网络、供应商排队/推理/传输，以及可能重叠的客户端处理，不等于服务端纯推理时间。区间外包含数据库、工具和运行时处理，不能称为纯 CPU。原生阶段计时相互嵌套，不能再与请求并集相加。

| 组别 | 最慢任务 | 耗时 ms | 模型请求区间 ms | 请求数 | 失败类别 |
| --- | --- | ---: | ---: | ---: | --- |
| lingxios-baseline | edit-meadow #3 | 9412 | 9239.5 | 4 | — |
| lingxios-baseline | edit-harbor #2 | 6682 | 6401.2 | 6 | — |
| lingxios-baseline | edit-harbor #3 | 6235 | 6009.1 | 6 | — |
| lingxios-baseline | edit-harbor #1 | 5254 | 4981.5 | 6 | — |
| lingxios-baseline | edit-meadow #2 | 4403 | 4226.5 | 4 | — |
| lingxios-candidate | edit-harbor #1 | 10173 | 9900.8 | 6 | — |
| lingxios-candidate | edit-harbor #2 | 7500 | 7276.1 | 6 | — |
| lingxios-candidate | edit-harbor #3 | 5572 | 5307.9 | 6 | — |
| lingxios-candidate | edit-meadow #2 | 4252 | 4069.3 | 4 | — |
| lingxios-candidate | edit-orbit #2 | 4251 | 4091.7 | 4 | — |
| deepseek-harness | edit-harbor #3 | 8529 | 8381.0 | 6 | — |
| deepseek-harness | edit-harbor #1 | 5630 | 5486.6 | 6 | — |
| deepseek-harness | edit-harbor #2 | 5066 | 4911.1 | 6 | — |
| deepseek-harness | read-orbit #1 | 4387 | 4268.3 | 2 | — |
| deepseek-harness | edit-meadow #2 | 3879 | 3740.6 | 4 | — |

## 逐任务结果

| 任务 | 原版通过 | 候选通过 | DeepSeek 通过 |
| --- | ---: | ---: | ---: |
| read-orbit | 3/3 | 3/3 | 3/3 |
| edit-orbit | 3/3 | 3/3 | 3/3 |
| read-only-orbit | 0/3 | 3/3 | 3/3 |
| direct-orbit | 3/3 | 3/3 | 3/3 |
| read-harbor | 3/3 | 3/3 | 3/3 |
| edit-harbor | 3/3 | 3/3 | 3/3 |
| read-only-harbor | 0/3 | 3/3 | 3/3 |
| direct-harbor | 3/3 | 3/3 | 3/3 |
| read-meadow | 3/3 | 3/3 | 3/3 |
| edit-meadow | 3/3 | 3/3 | 3/3 |
| read-only-meadow | 0/3 | 3/3 | 3/3 |
| direct-meadow | 3/3 | 3/3 | 3/3 |

未通过样本：

- lingxios-baseline：read-only-orbit #1 (completed)；read-only-harbor #1 (completed)；read-only-meadow #1 (completed)；read-only-orbit #2 (completed)；read-only-harbor #2 (completed)；read-only-meadow #2 (completed)；read-only-orbit #3 (completed)；read-only-harbor #3 (completed)；read-only-meadow #3 (completed)。
- lingxios-candidate：无。
- deepseek-harness：无。

## 修复与复现

`lingxios.patch` 修改通用执行提示词和当前请求的呈现：动作前检查禁止条件与条件分支；精简重复规则并区分运行时授权上界与实际可调用目录，并显式标明各命名空间的只读状态，能力从目录与授权判断，不通过读取内容探测缺失的写权限；回执和 verifier 不替代显式写后读回。当前人类请求以带来源的原文 user 消息呈现，其他信任级别仍保留数据封装。未加入任务 ID、文档内容、答案或模型专用分支，授权与持久化核验不变。

原始采集 SHA-256：`71fe2fefbe1171d2f729a066e26d95405d8efda69ca06e1716bb8fd6c15ae6bb`。协议摘要：`ceeef0039f40d228206e423dc0a399ce4baca76b520aaed01190364011ac4247`。候选源码和编译输出指纹见 `provenance.json`，补丁来自固定 4.0.0 源码提交。

```sh
python3 results/round-7/source/compare.py score results/round-7/live.json
python3 results/round-7/source/diagnose.py json results/round-7/live.json results/round-7/provenance.json
python3 results/round-7/source/diagnose.py report results/round-7/live.json results/round-7/provenance.json
```

结果只覆盖这 12 个合成任务；三次重复不是独立任务总体。共享供应商缓存与负载仍会波动。候选只是语义行为修复，不是对任意自然语言的确定性约束解析；生产部署和完整业务回归不在本轮范围。
