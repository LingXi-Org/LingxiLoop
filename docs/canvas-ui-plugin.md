# Canvas 的 MCP Apps 文档配置

Issue: [#210](https://github.com/LingXi-Org/LingxiLoop/issues/210)。这是内置文本/文档编辑器的 Web 适配，不是完整 ZCode UI Plugin 平台。聊天壳、历史消息、Gen UI/Tweak、HTML/图片/artifact 的分派保持原样。

## 冻结的官方实现 → 当前差距 → 本轮适配

2026-10-20 通过 `git ls-remote` 冻结 ZCode main `0a1fc56d279fd1001f78387bd81aec1c26767411`，与 #193 相同；插件仓 main `4acdd7ffc325fbdd9c8d934dc3ce03c7c62cb7f6`。不能把这次调研说成换了更新的上游版本。

| 官方真实代码/行为 | 原有 LingxiLoop | 本轮对应 |
| --- | --- | --- |
| [UI_PLUGIN.md](https://github.com/zai-org/ZCode/blob/0a1fc56d279fd1001f78387bd81aec1c26767411/UI_PLUGIN.md) 区分 Gen UI 与 MCP Apps；交互插件只在 Desktop 本地工作区 | #193 已落地 Gen UI/Tweak；原生 Canvas 没有 App 握手 | 固定内置文档 App，明确属于自有 Web 适配 |
| [HostController](https://github.com/zai-org/ZCode/blob/0a1fc56d279fd1001f78387bd81aec1c26767411/packages/ui/src/plugin-ui/app/pluginUiHostController.ts) 安装处理器后连接；完整 toolInput/result/cancelled feed | React 内联文本框 | `mcp-app/host.ts` 使用官方 AppBridge/PostMessageTransport；初始 input 后发完整文档，revision 更新不重建 iframe |
| [页面生命周期契约](https://github.com/zai-org/ZCode/blob/0a1fc56d279fd1001f78387bd81aec1c26767411/packages/ui/src/plugin-ui/CONTRACT.md) 页面实例独立于展示锚点 | 编辑器随预览关闭，未区分草稿 revision | `CanvasDocumentEditor.tsx`、`CanvasView.tsx`：预览/编辑保留同一活页，退出明确提示，授权范围改变立即撤销 |
| [插件服务器](https://github.com/zai-org/zcode-plugins/blob/4acdd7ffc325fbdd9c8d934dc3ce03c7c62cb7f6/ui-plugins/excalidraw/src/adapters/server.ts) `_meta.ui.resourceUri/surface/visibility` 与 read/commit 工具 | PostgreSQL 已有 frame ID/revision 和 CAS | `contract.ts` 声明 `ui://lingxiloop/canvas-document.html` 与 app-only read/commit；绑定卡片，不接受任意目标；没有通用 MCP resource 服务 |
| [Excalidraw 客户端](https://github.com/zai-org/zcode-plugins/blob/4acdd7ffc325fbdd9c8d934dc3ce03c7c62cb7f6/ui-plugins/excalidraw/ui/client.ts) 复用 App；能力探测；引用用 updateModelContext | Canvas 反馈已有显式发送 | `editor.js` 复用官方 App，保存选区经 updateModelContext 暂存；宿主对话框可编辑反馈并最终发送/取消，声明的能力不含 ui/message |
| [DocumentStore 契约](https://github.com/zai-org/zcode-plugins/blob/4acdd7ffc325fbdd9c8d934dc3ce03c7c62cb7f6/ui-plugins/excalidraw/src/CONTRACT.md) SQLite 持久文档；expectedRevision 与最多 32 条 operationId 幂等记录；冲突保留草稿 | PostgreSQL 原子 CAS；旧内联保存错误地取最新 store revision | 沿用现有授权 API/PG，以草稿读到的 revision 提交；冲突保留草稿，重载需确认；未知响应只读回核对。没有搬 SQLite 或宣称 operationId/exactly-once |
| [Gen UI contract](https://github.com/zai-org/ZCode/blob/0a1fc56d279fd1001f78387bd81aec1c26767411/packages/shared/src/gen-ui/contract.ts) 16KiB 整体状态，仅 modelContent 进入模型 | #193 持久文档和 privateContent 隔离 | 保持既有实现；新 `ui/set-widget-state` 仅视图 dirty 布尔标志，不含正文或模型上下文 |

SDK 为仓库既有精确依赖 `@modelcontextprotocol/ext-apps@2.0.0` / `@modelcontextprotocol/sdk@1.30.0`；没有增加依赖、持久协议类型或迁移。`app-with-deps` 发布 bundle 原样导入，仅转成 data URL 供 opaque iframe 内的 ES module 加载，不重写 JSON-RPC 协议。

## 生命周期、数据与安全边界

- 固定 App 为 `sandbox="allow-scripts"` 的 opaque origin；宿主同时校验实际 iframe Window/source 和 `origin === "null"`。无 same-origin、网络、子 iframe、表单、弹窗或下载权限。CSP 只允许固定 nonce 脚本及 SDK data module。模型文本只能进入 textarea，不生成 markup。原 HTML 卡片仍为 `sandbox=""`。
- iframe 只收到 frame/canvas ID、标题、正文、类型、revision。用户身份、token、任意 frame.data 不进入 App。宿主捕获 user/company/project/canvas/frame，API 仍执行现有租户/项目授权；卸载/切换范围后 AbortController 和实例标识阻断迟到结果。
- `read_frame` 无参数，`commit_frame` 只接受 content 与正整数 expectedRevision，正文最多 1MiB UTF-8。非法工具、额外目标字段、未知能力不转发。`ui://` 是此固定 App 的逻辑身份，不代表任意资源代理已实现。
- 文档快照、编辑草稿和引用上下文分开。原内联自动保存改为明确的“保存修改”，显示未保存状态。远端 revision 不覆盖草稿；保存期间继续输入不会丢失。迟到 ACK 不能把宿主文档降为旧 revision。
- 20 秒请求期限；失败/未知提交结果做授权读回，内容和较新 revision 匹配才确认，绝不自动改 baseRevision 重写。SDK cancellation 会取消本地等待/网络请求，不保证撤销已到达数据库的提交；下一次读取才判定持久结果。没有 operationId ledger，因此不承诺 exactly-once 或可证明该版本由本次请求创建。
- 普通保存、视图状态和引用不启动 Agent。引用必须匹配当前已保存正文/revision，最多 2000 字符；宿主显示引用，用户填写反馈并明确发送或取消。反馈文本和引用合计最多 4000 字符。沿用现有 steer/assign + comment 流程，不新增自动重试；两步提交的既有原子性限制未在本轮重构。
- 预览/编辑切换保留活页，完整关闭/重载只恢复 PostgreSQL 已保存内容。返回对话和页面 unload 提示未保存草稿；没有新增跨页面/跨设备草稿恢复。其他路由切换与范围撤销不承诺草稿持久化。一般通道失败保留可复制的只读页面，重新打开需确认；授权撤销或异常导航清空页面。

## 不适用与未实现

不提供第三方插件安装、通用 MCP 服务发现、通用 resources/read、App tools、sampling、sendMessage、Desktop 文件/剪贴板、Excalidraw 图形兼容、CRDT、多页共享 undo。官方该 commit 的 token/HTML 增量 patch 与双向 progress 本来也没有完成，本轮不声称提供。没有改变 PR #204 的流式热路径或模型输出协议；原 Gen UI 仍按完整输出展示。

## 许可

新宿主/文档 App 为本项目实现；只按上列永久源码研究协议，没有复制 ZCode/Excalidraw 实现。既有 #193 上游文件与许可保持不变。npm SDK bundle 保留发布内容及内嵌 notices；另随 Web 产物分发原包 [MCP Apps LICENSE](../public/licenses/mcp-apps-2.0.0.txt)、[MCP SDK LICENSE](../public/licenses/mcp-sdk-1.30.0.txt)、[core](../public/licenses/mcp-core.txt)、[client](../public/licenses/mcp-client.txt)、[Zod](../public/licenses/zod.txt)、[content-type](../public/licenses/content-type.txt) 和 [cfworker](../public/licenses/cfworker-json-schema.txt) 许可。MCP Apps 的实际 LICENSE 描述 Apache-2.0 迁移、未重授权 MIT 贡献与文档 CC-BY-4.0，不能仅凭 package.json 简称为纯 MIT。

## 可重复验收

失败模型先于实现写在 [canvas-ui-plugin-failures.md](canvas-ui-plugin-failures.md)。浏览器用官方 tester-army/e2e + @e2e-dev/web，配置 `e2e.canvas-app.config.ts`；启动 `E2E_TELEMETRY_DISABLED=1 node_modules/.bin/e2e run --config e2e.canvas-app.config.ts`，有现成 Chromium CDP 时设置 `E2E_CANVAS_CDP_URL`。

测试加载真实 CanvasView、AppBridge、App、opaque iframe 与原反馈对话框。API fixture 只模拟确定性并发/错误，不是实际服务端授权证据；`probe.js` 仅由测试服务器追加到 App 以验证同 source 的非法 SDK 请求，不进入生产构建。实际 PG/Redis 授权及旧协议由独立服务端集成测试核验。最终检查命令、结果和截图见 [验收记录](../artifacts/canvas-app/README.md)。生产 rollout、实际 provider 回合及独立审查由父任务/唯一集成人按最终集成 commit 验证；本分支仅提交 draft PR。

## PR212 独立审查后的草稿竞态修正

原候选 `ebe818fe` 的六项浏览器用例和 CI 未覆盖“保存中撤销回原文”与“确认重载后继续输入”。两项均已由官方引擎复现草稿丢失，见[红测与修复记录](../artifacts/canvas-app/review-races/README.md)。固定 App 现在按输入 generation 保留请求开始后的输入；保存 ACK 只推进已确认 baseline，重载期间新增输入继续持有原 CAS baseline，明确再次确认后才替换。即使这些输入恰好等于旧正文，也保留未保存标志。没有改变授权、模型 HTML 权限或持久协议。
