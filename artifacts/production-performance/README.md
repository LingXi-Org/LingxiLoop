# 页面与对话性能验证

候选分支 `codex/production-performance`，基于 `e610e863a9d434c392552123a2dd8ead7fd99a0a`。
保留 LingxiOS 3.3.6、现有模型及主分支已有的关闭思考/安全正文流式输出。
原工作区的未提交修改未带入本工作树。没有发布生产。

## 结果与范围

- `summary.json`：版本、包体/静态请求数对比、检查结果及未完成项。
- `baseline-build.json` / `candidate-build.json`：生产构建静态依赖的逐文件原始字节与 gzip 字节。
- `asset-http.json`：真实 Express 静态服务的 16 项 HTTP 检查；仅 mock 无关基础设施启动。
- `server-integration.log`：专用 PostgreSQL/Redis 下的 RAG 超时/取消、已读 outbox、非思考流式/账本集成结果。
- `web-regression.log` / `lint.log` / `candidate-build.log`：定向回归、lint、类型检查及生产构建结果。
- `chat-regression.log`：最终聊天 15 项定向检查；`server-context-parallel-red.log` 保留并行读取改动前的预期失败，修复后通过记录见 `server-integration.log`。

默认聊天 JS/CSS gzip 合计从 **1,361,955 → 982,988 字节（减少 27.83%）**。拆分后静态 JS/CSS 文件数从 **13 → 15**；这不等于浏览器总请求数，鉴权预检、重复 ticket 和 Google Fonts 的请求减少未计入此数值。

包体基线是最新主分支 e610e86，并非生产旧版 6f0e0c4。静态请求数只统计 HTML 入口引用的 JS/CSS 与 App/Provider/默认聊天的静态依赖，不含字体、运行时数据、缓存命中和条件动态加载。六个面板成为单独动态入口，默认聊天依赖不再包含它们。没有将包体降幅换算成用户等待时间。

浏览器连接多次超时/返回 fetch 失败，未获得真实浏览器样本；大陆网络冷加载、会话切换各五轮以及固定对话的真实耗时、中位数、错误率仍待验收。`summary.json` 对这些值保留空数组/null，不能视作通过。键盘命令逻辑已检查，真实面板打开和焦点操作仍待浏览器验收。

## 重跑

```powershell
npm run build -- --manifest
# DesktopApp 被 Rollup 合并到共享 chunk；从 manifest 中 App.dynamicImports 找到其实际 key。
node scripts/measure-web-build.mjs dist artifacts/production-performance/candidate-build.json '_mermaid-HWGCJPDP-CNz91-Of.js' --check-deferred
node --import tsx --experimental-test-module-mocks artifacts/production-performance/check-asset-http.mjs
node --import tsx --experimental-test-module-mocks --test --test-force-exit --test-concurrency=1 src/lib/workspaceConversationScope.test.ts src/lib/commands.test.ts src/features/chat/runtime/history-loading.test.ts src/features/chat/runtime/latency.test.ts src/api/core/realtime.test.ts
npm run server:typecheck
# 按仓库 integration runner 的环境要求，使用独立测试 PostgreSQL + Redis。
node server/run-integration-tests.mjs --file runtime-context-latency.test.ts --file runtime-nonthinking.test.ts --file runtime-response-policy.test.ts
```

`--check-deferred` 检查六个面板的动态入口与默认加载依赖，不对波动的毫秒值设 CI 门槛。集成中的超时断言只用于检查取消机制的受控故障，并不是线上性能门槛。自动 RAG 的 5 秒仅限制上游搜索（包含响应体读取），不限制整个授权和上下文准备流程；显式知识搜索保留 90 秒预算。

浏览器恢复后，固定浏览器版本、视口、账号/项目、网络及测试对话；冷加载禁用缓存各五次，暖缓存会话 A/B 切换各五次，再发送相同测试消息。DevTools 执行 `capture-browser.js`，使用 `await lingxiPerformanceSamples.export('cold-1', '网络条件说明')` 保存 JSON。冷加载可在页面出现后读取保留的 readiness measure；切换及对话需在操作前安装 observer。基线没有新增 readiness 打点，应采用同样的测量边界补齐后再比较。脚本仅记录耗时和状态，不输出正文、提示词、资源 URL 或会话标识。

发布须另行授权。授权后记录上一镜像，通过 Komodo 完成状态、实际容器镜像和 `/api/meta.commitSha` 三方核对，再进行大陆浏览器验收；功能回归通过 Komodo 回退上一镜像。
