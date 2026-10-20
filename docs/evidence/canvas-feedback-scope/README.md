# PR212 引用反馈范围修复

审查基线 `ebe818fe9f702199382aa998995da24b55e4b356`。失败模型见 [failure-model.md](failure-model.md)。本追加修复不涉及模型 HTML、Gen UI/Tweak、旧消息、流式协议、运行时依赖或迁移。

## 已复现的问题

- 官方 tester-army/e2e + @e2e-dev/web，真实 CanvasView/App/AppBridge，控制 API 的 steer ACK 延迟。在 A 发出引用反馈、关闭画布并把工作区/活动画布切到 B 后，旧 submit 闭包继续调用全局 `addComment`，发出了 `frameId=A`、`canvasId=B`、正文为 A 引用的评论。红例 1 failed（10.20 秒）；[请求证据](../../../artifacts/canvas-app/feedback-scope/browser-red.json)、[日志](../../../artifacts/canvas-app/feedback-scope/browser-red.log)。这是确定性边界复现，不是真实登录的完整导航旅程。
- 实际 HTTP 路由、权限服务和独立 PostgreSQL：同公司同项目的两个画布，给 B 评论携带 A 卡片，修复前返回 201，期望 404。红例 0/1；[日志](../../../artifacts/canvas-app/feedback-scope/http-red.log)。登录身份由测试 helper 注入。

## 修复

反馈对话框捕获 user/company/project/canvas/frame；AbortController 身份作为本次活页代次。关闭/取消同步中止等待，范围变化和卸载中止旧代次。发送前、每个 await 后和每个后续写前重验，所有请求使用捕获的画布 ID。A→B→A 不会恢复已失效代次。服务端要求评论卡片确实属于目标画布，不一致返回 404。

“停止等待”不承诺撤销服务端已接受的第一步，不自动重发；第一步成功但评论失败的原两步原子性限制保留。

## 复现命令与边界

新浏览器例：`E2E_TELEMETRY_DISABLED=1 node_modules/.bin/e2e run --config e2e.canvas-app-feedback.config.ts`。测试需同时包含草稿竞态修复提交中的 `e2e/canvas-app/serve.mjs` fixture 扩展（steerDelay/finishedSteers）；这两个参数只属于测试服务器，默认零延迟。浏览器均使用官方 engine，不直接调用 Playwright。

HTTP：向独立已迁移测试数据库运行 `node server/run-integration-tests.mjs --file canvas-feedback-scope.test.ts --file canvas-public-assignment.test.ts`；本轮使用单独本地 compose project、PG 55438 / Redis 56388，未使用或清空其他任务的集成数据库。环境仅使用仓库已有合成测试配置，无生产访问或凭据创建。

最终结果、源文件 hash 和边界见 [验收摘要](../../../artifacts/canvas-app/feedback-scope/validation.json)。真实 provider、真实网关登录多人全旅程、所有故障分支和生产回执未在本子任务验证；最终集成人负责精确候选 CI、独立复核与部署。
