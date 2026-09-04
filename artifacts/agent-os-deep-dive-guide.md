# LingxiLoop Agent OS 深入讲解导读

本导读基于当前工作区代码静态分析与定向测试，配合 7 张 Archify 可交互页面阅读。它描述的是“仓库现在如何运行”，并把已经实现的可靠性机制、显式边界以及当前缺口分开标注。

## 页面导航

1. [高层系统总览](agent-os-deep-dive-overview.html)：进程、权威数据源、模型、Kernel、Host Bridge 与产品服务边界。
2. [消息触发、路由、入队与领取](agent-os-deep-dive-trigger-claim.html)：从 WuKongIM post-commit webhook 到双租约 claim。
3. [模型、IPython、Host Action 与审批](agent-os-deep-dive-model-tools.html)：完整 hop loop、cell 执行、授权、幂等和 resume。
4. [事件、最终回复、Stop / Steer 与恢复](agent-os-deep-dive-control-recovery.html)：预览与权威消息、抢占、fence 和崩溃窗口。
5. [Canvas 多 Agent DAG](agent-os-deep-dive-canvas.html)：共享状态、隔离执行、report gate、verifier 与 reporter。
6. [Prompt、知识上下文与长期记忆](agent-os-deep-dive-context-memory.html)：上下文分层、压缩、知识引用和 memory synthesis。
7. [联合生命周期](agent-os-deep-dive-lifecycle.html)：把 work、run、session、审批、抢占和终态放回同一状态机。

## 一句话架构

LingxiLoop Agent OS 不是“Web 接口里调用一次模型”，而是一套独立的、租约驱动的持久 Agent 运行时：WuKongIM 提供权威聊天事实，PostgreSQL 提供工作、会话、事件、审批与动作账本，Agent OS 进程持有模型循环和 session 级 IPython，所有产品副作用经 Web Host Bridge 在最终操作点重新授权和幂等执行。

## 1. 消息怎样变成 Agent 工作

用户消息先落 WuKongIM。只有完成持久化和排序后，WuKongIM 才发送签名 post-commit webhook。Web 层验证事件签名、频道绑定、发送者成员关系、teacher room 约束和 payload digest，然后按固定优先级选择需要唤醒的 Agent。

路由不调用模型：handoff target、@all、显式 @mention、reply author、私聊 Agent、leader 和 Nova/Forge fallback 都是确定性规则。Agent 自己发的消息默认不扩散，避免 Agent 互相无限唤醒。

receipt 与一个或多个 `AgentWorkItem` 在同一数据库事务中提交。唯一键 `(agent_id, trigger_client_msg_no, reason)` 让 webhook 重放收敛；同 eventId 复用不同 payload digest 则冲突。queued preview 在事务提交后才发布，因此实时通道失败不会吞掉耐久 work。

## 2. 任务怎样被领取

Agent OS 独立进程轮询 Control Plane。领取 SQL 使用 `FOR UPDATE SKIP LOCKED`，先按 lane 排序，再按 priority 和 created time：learner > approval > collaboration > background。

一次 claim 同时建立两种 45 秒租约：work lease 确认当前任务所有者，session lease 确认同一 company/agent/channel/thread 会话只有一个执行者。每次重新领取都会令 fence 单调递增；原始 lease token 只交给 worker，数据库只保存 hash。

Agent OS 每 5 秒 heartbeat 同时续两个租约，并获取 cancel、preempt 和 steer。旧 worker 即使仍存活，也无法用旧 fence 保存 session、执行 Host Action 或正常完成。

## 3. 上下文怎样装入

Control Plane 从 WuKongIM 同步最多 80 条权威消息并推进 Agent 已读；从 PostgreSQL 读取 persona、capabilities、session、审批结果、Canvas roster/snapshot 和持久的人类授权主体；从 pgvector 召回长期记忆；从知识服务执行本 turn 的初始 RAG。

Prompt 分为三层：稳定策略层包含平台约束、执行角色、能力、persona、日期和记忆；run 初始层包含用户输入、聊天历史、知识、审批和 Canvas；逐 hop 层刷新学习/teacher 上下文并注入 Steer。

session key 是 `company + agent + channel + threadRoot?`。history、summary、PromptContext、compactionEpoch、revision 和最近 200 个 appliedWorkIds 都随 session 保存。后者防止同一耐久 work 重试时再次注入同一用户输入。

## 4. 模型循环是谁控制的

Agent OS 自己控制循环，模型提供者不拥有 LingxiLoop 历史。默认最多 12 个 hop；每个 hop 发出 model.started，流式接收 delta，聚合文本和工具参数，再发出 model.completed 与 usage。

模型可见工具只有严格的 `ipython({code})`，不接受其他名字、空 code 或附加参数。工具调用按顺序执行，每个调用生成稳定 `cellId=hop-N-call-M`；输出作为 `function_call_output` 加回 history，再进入下一 hop。

无工具调用也不一定结束：Mission planning gate 和 Canvas report gate 可以阻止过早 final。上下文达到默认 128k 窗口约 75% 时软压缩，90% 时进入硬阈值；模型摘要被限制在约 1500 token，稳定系统策略随后重新装配。

## 5. IPython 的持久与隔离

每个 session key 对应一个持久 Python 子进程。变量、imports 和 globals 可跨 work 保留；同一 kernel 用串行 tail 执行 cell。Agent Home 根据 company/agent/channel/thread 哈希隔离，文件和 artifact 也在这里延续。

默认 cell 超时 120 秒、输出上限 64KiB、idle 90 分钟。取消发送 SIGINT，超时发送 SIGKILL；两者都会从 manager 移除 kernel，下次需要时重建。

Python 以 `-I` 启动，并通过网络 monkeypatch、audit hook、子进程拦截、写路径限制和跨 Agent Home 读限制压缩能力面。这是解释器级防护，不是面向恶意任意 Python 的硬化 OS sandbox。

## 6. loop.* 怎样成为真实产品动作

kernel 预加载 chat、memory、skills、files、documents、boards、canvas、calendar、routines、research、email、knowledge、presentations、learning、polls、turn 等命名空间。teacher run 只开放 teacher 与 turn。Python 命名空间只提供调用表面，最终安全边界仍在 TypeScript Host Bridge。

每次 Host Action 必须满足：action 名和参数闭集合法、args 不超过 64KiB、`idempotencyKey == runId:cellId:callIndex`、work fence 仍可执行、tenant/Agent/human principal/role/capability/resource 均允许。共享 Canvas 动作、work 和 idempotency row 按顺序加锁，减少死锁并让并发重放收敛。

动作先写 ledger，再执行领域 side effect，再保存 canonical result。如果崩溃发生在副作用之后，pending ledger 会再次驱动；因此真正的 exactly-once 仍依赖每个领域 sink 接受同一幂等身份。

## 7. 审批为什么不会重放原 cell

邮件发送、routine 创建/激活、删除文档或日历、知识源启停/删除、presentation outline 批准等动作进入 PENDING。原 work 收到 `approval_pending`，保存 session 并结束，不把 Python 线程挂在内存里。

人类批准时重新检查权限、TTL 和 teacher 管理关系，然后直接以原 action identity 执行或记录拒绝。Web 随后创建 `resume-{approvalId}` 的高优先级 work。新运行加载 resolution 继续模型循环，绝不重放原始 cell。修改请求会 supersede 旧审批并产生新的 cell revision/动作身份。

## 8. 最终回复、预览和事件

run event 使用 `(runId, sequence)` 唯一约束；不同 fence 的 sequence 分配到不同区间。model.delta 和 activity 是可丢弃的实时投影，刷新后不应依赖它们恢复聊天。

普通成功 run 使用稳定 `clientMsgNo=agent-{workId}` 提交一条 `LingxiMessageV1` 到 WuKongIM。客户端收到权威消息后清理同 run 预览。Canvas worker 例外：它的文本存 assignment，不直接回复群聊；Canvas reporter 才提交唯一最终消息。

## 9. Stop、Steer 和抢占

Steer 以 clientRequestId 幂等写入耐久队列，heartbeat 拉取后在下一模型 hop 前以最高优先级注入。它不打断当前 cell，也不改写已经发生的历史。

Stop 设置 `cancel_requested_at`。下一 heartbeat 中止模型、向 cell 发 SIGINT 并终结 run。Host Action 使用 actionable lease，所以取消一落库，新的副作用马上被拒绝。

watchdog 在高 lane 等待超过默认 120 秒时请求抢占低 lane work；worker checkpoint 后 yield、释放 session lease、work 回队且 fence+1。30 秒 grace 后仍未响应，watchdog 强制 requeue 和推进 fence。

## 10. Canvas 协作

Canvas 共享 workspace、assignment DAG、frames、reports 与状态，但绝不共享 kernel、globals 或 Agent Home。只有依赖全部完成的 assignment 入队；builder 与 verifier 必须是不同 Agent。

`canvas_worker` 不能靠最终文本完成，必须提交与 assignment 绑定的 `learning_report_v1`。报告持久化后才标记完成和解锁下游。全部 assignments 完成后创建一个 `canvas_summary` work，reporter 必须消费 report IDs、提交自己的 reporter report，再向 WuKongIM 发一条汇总。

workspace stop 会阻止 summary，避免用户取消后收到迟到交付。Redis/WebSocket 可以实时展示 Canvas 状态，但 PostgreSQL snapshot 才是 DAG 权威。

## 11. 长期记忆

最终答复后，runtime 记录有界 user/assistant evidence，并创建 background `memory_synthesis` work。后台批量读取最多 12 条 evidence，让模型提出不超过 64 个 memory changes，再由独立模型验证。只有 confidence ≥ 0.6、scope 合法且 optimistic version 匹配的变化写入 `agent_workspace` pgvector(1536)。显式和 pinned memory 不允许被自动合成修改。

知识 RAG 与长期记忆是两个不同网络：前者是 Open Notebook/SurrealDB 的文件知识，后者是 PostgreSQL/pgvector 的 Agent 经验；它们只在 Prompt 装配处汇合。

## 12. 当前实现的高价值审计发现

1. **memory_synthesis 当前会被空查询阻断。** `recallScope` 拒绝空 query，而 `loadMemorySynthesisBatch` 用 `query: ''` 读取当前 memories；非空 evidence batch 会在 proposal 前失败。
2. **Stop 与最终消息之间存在短竞态窗口。** Host Action endpoint 检查 `cancel_requested_at IS NULL`，final message endpoint 只检查 live lease；在下一次 5 秒 heartbeat 前，恰好完成的模型仍可能提交 final。
3. **Persona/capability 版本没有参与 PromptContext 刷新判断。** candidate 记录两者版本，但 runtime 只比较 executionRole 与 knowledgeContract；已有 session 可能保留旧 persona/能力到压缩或其他刷新条件发生。
4. **后续显式知识搜索没有并入最终 citation whitelist。** validator 只使用初始 `context.knowledgeContext`，后续 `loop.knowledge.search` 的新来源虽在 history 中，却没有进入同一校验集合。
5. **LLM 记账是事件驱动的。** provider 调用完成后 runtime 才发 model.completed/failed；Control Plane 收事件后写 llm_calls。两步之间崩溃可能留下未记账调用。
6. **Kernel 不是硬化安全边界。** Python audit hook 能阻止常见网络、子进程和越界写入，但不能等同于容器/VM 级 hostile-code sandbox。
7. **定向测试存在 1 个工作区回归。** 30 个相关单元测试中 29 个通过；`agent-os-learning-scope.test.ts` 仍断言旧的 `sources s` Project-scope SQL 形状，而当前 Control Plane 已改为 `knowledge_sources` + permission service。需要决定是更新结构性测试，还是恢复它想保护但已迁移的约束。

## 代码证据入口

- 消息与协调契约：`docs/COORDINATION.md`
- 运行时循环：`server/src/agent-os/runtime.ts`
- claim、context、session、event、final：`server/src/agent-os/control-plane.ts`
- 唯一模型工具：`server/src/agent-os/tool.ts`
- Host Action：`server/src/agent-os/host-action-application.ts`
- Kernel：`server/src/agent-os/kernel-manager.ts`、`server/agent-os/kernel_runner.py`
- 记忆：`server/src/agent-os/memory-service.ts`
- Canvas：`docs/CANVAS.md`、`server/src/modules/canvas/`

## 验证说明

所有 7 张候选页均使用 Archify `quality_profile=showcase`，在冻结交付前通过 9/9 结构与构图检查，composition errors=0、warnings=0。定向测试命令覆盖 approval、authorization、concurrency、learning scope、model driver、routing、runtime 和 strict tool；结果 29/30 通过，失败项已在上文如实列出。
