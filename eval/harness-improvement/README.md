# LingxiOS 工具约束修复与同期三组评估

本轮在上轮已授权的独立评估分支执行，继续使用仓库现有 GitHub Secrets 与 Sigillo，密钥仅注入 CI 进程，不输出或落盘。生产依赖与部署不变。

## 固定协议

- 共同模型：SiliconFlow `deepseek-ai/DeepSeek-V4.1-Flash`。任务、schema、权限、答案与状态 oracle、温度、思考开关、预算、人民币价格与上一轮完全相同。
- 12 个任务，每题 3 次，三组各 36 次，总计 108 次。每个三元组串行运行；六种排列各使用六次，平衡各组的前中后位置。
- `lingxios-baseline`：已发布的 `@lingxi-org/lingxios@4.0.0`，验证其 registry 来源与 integrity。
- `lingxios-candidate`：从相同版本的源码提交 `6f709b4e41993cf0eb65c40679bc22bc9a67012b` 应用 [lingxios.patch](lingxios.patch) 后构建。未发布，不冒称正式包；运行前验证补丁和全部编译输出哈希。
- `deepseek-harness`：原固定版本 `0.2.2-rc.3`。两个 LingxiOS 组只通过各自包的公开入口运行，同一工具夹具和独立 PostgreSQL。

## 修复范围

补丁修改 LingxiOS `src/prompts/sections.ts`、授权说明 `src/prompts/provider.ts` 与请求消息渲染 `src/context/compiler.ts`，不修改模型、评分器、授权或运行循环。通用规则要求逐动作核对用户的禁止条件和 fallback，明确工具可用并不表示应该调用，以及写入回执/运行时 verifier 不替代用户要求的显式读回。将完成前检查覆盖到每次最终回复，精简重复说明并更正过时的身份版本文案。当前人类请求以带来源的原文 user 消息呈现，避免 JSON 转义封装；代理修订、观察和偏好仍作为带信任标签的数据。按真实工具 effect 标明各 namespace 的只读状态，去掉与 schema 重复的内部方法清单，只从当前 provider schema 选择函数；内部 grants 和实际权限检查保持不变。新增信任边界回归检查。没有文档 ID、任务答案或 benchmark 特判。

这是提示词层面的语义修复，不是对任意自然语言指令的确定性强制执行。真实模型结果决定是否达到本轮回归要求。

## 延迟与成本诊断

共享网关为三组记录相同的逐请求元数据：发起相对时间、上游响应头、首字节、首次内容、结束、下游断开、HTTP 状态、usage 完整性、各角色消息字节数，以及请求与系统内容的 SHA-256。**不保存原始系统提示词或密钥**。

LingxiOS 另外从隔离库采集模型 ledger 的白名单字段（尝试号、状态、结构化失败分类和阶段计时）。上游等待包含网络和服务端等待，不能当作服务端纯推理时间。网关请求重叠时用时间区间并集，不能简单求和当成任务耗时。字节数不等于 token，真实成本以供应商返回的 token 为准。

与上轮相比，网关停止时等待已取消请求的处理器完成，确保诊断对象稳定后再落盘；不改变采样参数、任务计时终点或评分 oracle。缺失 usage 保留 null，报告已知成本下界。

## 复现

[工作流](../../.github/workflows/harness-improvement.yml) 先安装发布包，检出固定源码并应用补丁，构建/类型检查/运行已有测试，再验证 108 次本地替身采集，最后用 Sigillo 启动真实评估。数据库只连 `127.0.0.1:55438`，不继承生产连接配置。

```sh
python3 compare.py manifest
python3 results/round-1/source/compare.py score results/round-1/live.json
python3 results/round-1/source/compare.py report results/round-1/live.json
```

工件包含原始采集、逐行 journal、指标、替身结果，以及记录源码/补丁/依赖/编译输出哈希的 provenance。保留所有真实尝试，不通过补跑替换失败样本。

所有迭代分别保留在 `results/round-N`，每轮附带 `source/` 快照。重算历史轮次必须使用其快照中的 `compare.py` 和 `diagnose.py`，不能套用最新协议。最终汇总见 [REPORT.md](REPORT.md)。

## 适配器错误语义修正

第六轮起，两组 LingxiOS 的 `conflict / denied / invalid` 分别通过公开 `NoEffectError` 映射为 `version_conflict / forbidden / invalid_arguments`。此前统一使用 `native_rejected`，会丢失版本冲突语义、产生未知失败诊断。前五轮保留但不能作为完全语义对等的冲突恢复比较。业务工具 schema、权限、fixture、评分器和模型均未改变。替身 E2E 新增冲突后原生模型观察必须包含 `version_conflict` 的断言。
