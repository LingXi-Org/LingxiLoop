# LingxiOS 工具纪律修复、延迟与成本评估

最终候选在本轮通过 **36/36**；同期发布版 4.0.0 为 **27/36**，DeepSeek Harness 为 **36/36**。候选禁读条件正确执行 **9/9**，成功写入后显式读回 **9/9**，未开放工具尝试 **0** 次。候选未发布、未部署。

本轮覆盖的问题未再出现，结论仅限此固定任务集。

最后一轮是 [Actions 43897103735](https://github.com/LingXi-Org/LingxiLoop/actions/runs/43897103735)，评估提交 `6eea76bd5868a96ae62c47b0fd7932769025903d`。模型固定为 SiliconFlow `deepseek-ai/DeepSeek-V4.1-Flash`；相同 12 任务、每题三次、工具权限、评分器与预算，三组共 108 个真实样本，六种组别顺序均衡交替。

## 最终同期指标

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

候选已知归一化成本较同期原版减少 **21.4%**。候选 p95 为 7.50 秒，高于原版的 6.68 秒，**本轮未实现长尾延迟改善**。延迟是本轮观测值，不能由一次小样本对照证明稳定性能收益。完整用量、逐请求时间和逐任务结果见 [最终详细报告](results/round-7/report.md)。

## 修复和发现

1. **执行语义**：精简重复平台规则；当前人类请求按原文 user 消息呈现，保留来源/版本，其他信任级别仍作为数据。明确用户禁止条件和 fallback，以及写入回执/后台 verifier 不能替代显式写后读回。
2. **权限说明**：从工具 effect 推导各 namespace 的只读状态，直接告诉模型是否具有修改能力；删除重复的内部方法清单，让当前工具 schema 成为唯一可调用目录。授权与控制面检查本身没有放宽。
3. **评估适配器缺陷**：前五轮把 conflict 统一映射为 native_rejected，原生分类器实际得到 unknown / recovery:none；修正为 version_conflict 后得到 version / recovery:refresh。denied、invalid 同时映射为 forbidden、invalid_arguments。第六轮起两组 LingxiOS 使用相同正确映射。此前冲突恢复质量不能视为完全对等对照，也不能全部归咎于生产 runtime。

补丁：[lingxios.patch](lingxios.patch)。源提交固定为 `6f709b4e41993cf0eb65c40679bc22bc9a67012b`，基于正式 4.0.0 源码构建；与正式 npm 包分别加载并验证，未替换生产依赖。

## 成本原因

| 项目 | 原版 | 候选 | DeepSeek Harness |
| --- | ---: | ---: | ---: |
| 模型请求数 | 87 | 78 | 78 |
| 输入 token（含缓存） | 113670 | 82968 | 41190 |
| 输出 token | 2633 | 2232 | 2232 |
| 首请求平均 system 字节 | 3261.5 | 1804.5 | 150 |
| 首请求平均 user 字节 | 686.9 | 637.9 | 334.9 |

成本差距主要表现为更多输入 token，以及多余工具步骤造成的额外模型往返。消息字节诊断显示 LingxiOS 携带更多平台规则、请求来源及运行时上下文包装；字节不是 token，未将费用强行按提示词段落分摊。精简规则和减少多余动作有助于降低用量，剩余上下文开销仍使其高于 DeepSeek。

价格按 [SiliconFlow](https://www.siliconflow.cn/pricing) 每百万缓存命中/未命中/输出 token 0.04/2/8 元人民币归一化，使用每次返回的实际 token；不是账单实扣。供应商缓存状态会影响成本对比。

## 长尾延迟原因与证据边界

- lingxios-baseline：模型请求时间区间并集占样本总耗时 95.0%；区间外总计 4.222 秒。LingxiOS ledger 重试计数 0，配额等待总计 1.75 ms、输出回调等待总计 1.07 ms。DeepSeek 没有内部 ledger，不能把该组零计数解读为不存在内部开销。
- lingxios-candidate：模型请求时间区间并集占样本总耗时 94.8%；区间外总计 3.912 秒。LingxiOS ledger 重试计数 0，配额等待总计 1.50 ms、输出回调等待总计 0.98 ms。DeepSeek 没有内部 ledger，不能把该组零计数解读为不存在内部开销。
- deepseek-harness：模型请求时间区间并集占样本总耗时 94.2%；区间外总计 4.184 秒。LingxiOS ledger 重试计数 0，配额等待总计 0.00 ms、输出回调等待总计 0.00 ms。DeepSeek 没有内部 ledger，不能把该组零计数解读为不存在内部开销。

本轮尾部主要落在模型/网络等待，以及读、写、冲突刷新和核对所需的串行往返。没有证据表明 LingxiOS 配额队列或输出回调造成秒级堆积。模型请求区间也包含网络和重叠客户端处理，不能等同于供应商纯推理时间。错误语义丢失与重复工具目录能诱发额外步骤，但不解释所有供应商等待波动。

最初约 43.9 秒的 LingxiOS p95 在多轮未修改基线中也明显降低；旧采集缺少逐阶段时间，不能追溯断言其唯一原因，也不能把这段下降算作补丁收益。已保留新的逐请求诊断供后续复现定位。

## 全部迭代记录

| 轮次 | 原版通过 | 候选通过 | DeepSeek 通过 | 适配器状态 |
| --- | ---: | ---: | ---: | --- |
| [第 1 轮](results/round-1/report.md) | 29/36 | 27/36 | 36/36 | 旧错误映射，仅作调试记录 |
| [第 2 轮](results/round-2/report.md) | 28/36 | 27/36 | 36/36 | 旧错误映射，仅作调试记录 |
| [第 3 轮](results/round-3/report.md) | 28/36 | 31/36 | 33/36 | 旧错误映射，仅作调试记录 |
| [第 4 轮](results/round-4/report.md) | 29/36 | 35/36 | 35/36 | 旧错误映射，仅作调试记录 |
| [第 5 轮](results/round-5/report.md) | 28/36 | 33/36 | 35/36 | 旧错误映射，仅作调试记录 |
| [第 6 轮](results/round-6/report.md) | 29/36 | 34/36 | 35/36 | 错误语义已修正 |
| [第 7 轮](results/round-7/report.md) | 27/36 | 36/36 | 36/36 | 错误语义已修正 |

共保留 7 轮、756 个真实样本，不替换失败样本、不只展示最好一轮。适配器修正前后的结果分开解释。迭代反复使用同一小任务集，有适配该集合的风险，尚未做独立保留集或完整生产业务回归；三次重复也不是三个独立任务。供应商只暴露模型别名，没有不可变权重版本，所以可复现的是流程、输入和评分，不保证重跑输出及延迟逐字逐数一致。

## 验证与复现

最终 CI 通过源码构建、类型检查、79 项测试和 108 个替身 E2E。替身在原版/候选冲突后的真实模型输入链路中检查版本冲突诊断保留。真实采集使用已有 GitHub Secrets 与 Sigillo，只连接隔离 PostgreSQL，评估子进程不继承生产数据库配置，没有连接生产数据库或落盘密钥。

每轮含 live.json、逐行 journal、metrics.json、provenance.json、诊断与源码快照；provenance 固定生产元数据、评估提交、源码/补丁/采集器/编译输出哈希。

在本目录离线重算最终结果：

```sh
python3 results/round-7/source/compare.py score results/round-7/live.json
python3 results/round-7/source/diagnose.py report results/round-7/live.json results/round-7/provenance.json
```

重新执行完整真实采集（会再次产生模型用量，沿用仓库现有 Secrets）：

```sh
gh run rerun 43897103735 --repo LingXi-Org/LingxiLoop
```

工作流见 [.github/workflows/harness-improvement.yml](../../.github/workflows/harness-improvement.yml)。生产基线仍为已验证发布包；评估分支仅保存候选补丁和报告。

第七轮第一次尝试在真实采集前读取生产版本元数据超时，0 个真实样本；第二次尝试完成 108 个样本，见 [attempts.json](results/round-7/attempts.json)。
