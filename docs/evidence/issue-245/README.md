# #245 — 移除聊天活动聚合入口，恢复记忆查询的公开交错输出

基线：从远程 `main` fetch 后的 `5b2f6e43` 创建独立工作树与分支。运行时仍是正式发布的 `@lyyzka/lingxios@3.5.8`，native schema 13，产品迁移 48；没有改锁文件、运行时实现、数据库 schema、凭据或生产环境。

## 根因及改动

1. `context.ts` 的始终生效规则把“记忆内容与维护保持内部”用于所有记忆操作。现有 `public-task-progress` 是可选加载的技能，并不保证首轮模型已得到公开说明的要求。现在在外部会话的产品规则中要求：工具前通过普通 assistant content 简要说明实际下一步；收到工具结果后按需交错输出已观察到的信息。主动查看记忆与自动后台维护分开，后台维护仍不叙述，不公开私有推理、原始参数、凭据或虚构进度。
2. `NativeMessageContent.tsx` 的 `ActivityParts` 把真实工具和旧的公开说明藏在总览折叠层，仅保留最新说明；另由 `RunActivityHistory` 生成用户要求移除的两个计数入口。删除该组件与总览/重复工具时间线/更多活动路径，统一走现有 `MessagePrimitive.GroupedParts`。公开文本按消息原有顺序持续呈现，记忆等丰富工具卡片、审批、错误与 `HarnessDetails` 保留；相邻普通工具仍使用已有 ToolGroup。

## 完整链路定位

| 层 | 检查结果 |
| --- | --- |
| 模型流 | 已发布 OpenAI driver 仅向 `onTextDelta` 传递 assistant content，不转发 reasoning_content。新增本地 HTTP SSE provider 用门控保持请求未结束，实际走发布包的 driver。 |
| 工具编排 | 前两段公开文本可在 `memory.list` 的 tool.started 之前进入数据库与产品 SSE；无须新增一次模型调用或进度工具调用。 |
| 持久化/权限 | 原有 PublicTextWriter 安全前缀与约 50ms 合并边界、当前权限/冻结受众事务、attempt/request/fence 保持原样。门控期间重新读取已提交前缀成功。 |
| SSE | 原生事件 → RunStreamProjection → AssistantTransport 增量能在 provider 及工具轮次结束前被解码；没有复现等全任务完成再发的缓冲。现有可选呈现读取已独立，不为此重写 SSE/权限读取。 |
| React | harnessApi.subscribe 每条状态增量经 applyRunSnapshot 更新；旧 UI 的折叠呈现造成已收到的信息不可见。新浏览器测试在 SSE 保持打开时检查文本→记忆工具→文本均可见且顺序不变。 |

这是可复现的产品层原因与改正，不把未观测的生产等待归咎于数据库或供应商。既有 `docs/evidence/release-215-216-219/formal358/memory-latency.json` 也已分别测量了 memory 查询和后续轮次；本任务不重复改启动、首屏和对话切换加载。

## 验证

失败模型和测试先于实现。`ui-red.txt`、`browser-red.md` 记录旧聚合层导致的失败；`server-red.json` 记录实际模型请求缺少规则的基线失败，避免在交付证据中保存完整 prompt。

- 新的 HTTP 模型 driver + PostgreSQL + Worker + 产品 SSE 测试，以及既有持久公开文本取消/权限撤销/安全后缀/最终文本去重：**6/6**（`integration-green.txt`）。新案例只有两次本地模型调用，0 次付费或生产模型请求。
- 官方 `@e2e-dev/web`、实际 decoder/store/React 渲染组件：**21/21**，全部选中案例执行，无跳过（`browser-green.md`、`browser-green.xml`）。保留 [未结束时的交错输出](screenshots/memory-before-final.png)、[最终状态](screenshots/memory-complete.png)、[手机审批卡](screenshots/approval-mobile.png)。浏览器使用隔离 Vite fixture，生产构建另行检查。
- `npm run server:test`：**106/106**（`server-smoke.txt`）。Web smoke 首轮 65 个其他案例通过；此前未列入 smoke 的 ConversationMessage 测试缺少 SSR 的 TooltipProvider，补齐测试环境后该文件 **15/15**（`ui-green.txt`），没有改产品 Tooltip/可视化实现。
- Web、server、E2E typecheck 均通过；web/server lint 通过（保留已有 warning/info）；`npm run build` 通过（保留已有 chunk/CSS 警告，尾部见 `build-tail.txt`）。

复现：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:e2e:server -- --file memory-public-streaming.test.ts --file durable-public-activity.test.ts
CI_TEST_FILES='["src/features/chat/components/ConversationMessage.test.tsx"]' npm test
# 独立终端：npx vite --host 127.0.0.1 --port 5186 --strictPort
E2E_BASE_URL=http://127.0.0.1:5186 E2E_MEMORY_PRIVACY_FIXTURE=1 E2E_ACTIVITY_FIXTURE=1 npm run test:e2e:web -- memory-public-streaming activity-regressions memory-privacy public-activity-history run-activity activity-presentation --grep-invert 'official reference' --output artifacts/issue245/browser-green
```

## 限制与交接

没有供应商在首个 content 前的推理/排队延迟测量，也没有声称生产首字延迟达到某个 SLA。提示规则不能强制模型在尚未生成 content 时发出文本；安全策略保持不泄漏 reasoning，不以占位文本或动画补造进度。

现有有界快照和历史审计 API 保留；聊天不再提供活动分页入口。非常长运行的早期活动仍在服务端审计历史，当前快照的裁剪上限不变。该边界避免为移除入口引入无界下载或全面重构。

共享产品文件仅 `server/src/agent-runtime/context.ts`、`src/features/chat/components/NativeMessageContent.tsx`，并删除 `RunActivityHistory.tsx`。可视化任务若调整 `context.ts` 的 visualizeHostInstructions 拼接，保留本次相邻公开规则即可；本次未改任何 visualize 实现。启动/切换/骨架屏/右键删除任务的 ConversationThread、transport、store、API 均未修改。相关 E2E 只去掉旧活动折叠/分页的操作，保留原来的错误、审批、隐私及卡片断言。

不合并、不部署；由唯一集成者 `01a1545a-ea6d-7522-a38d-4c6f33afd0d5` 做最终独立评审与发布。#245 是新批次，不属于旧批次清零范围。
