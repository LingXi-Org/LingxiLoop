# #210 短期验收证据

初始审计基线 `e7422872a8314823794875c81b14f9393a08e15f`；提交前更新到最新 main `b29e40de`。使用根 package-lock 的 LingxiOS **3.5.5**、MCP Apps **2.0.0**，无生产写入、无长 soak、未动固定 3.5.3。

## 已执行

| 检查 | 结果/证据 |
| --- | --- |
| 官方 tester-army/e2e + @e2e-dev/web，真实产品组件/SDK/opaque iframe | **6 pass, 0 fail, 0 skip**；[日志](browser.log)、[JUnit](browser-junit.xml)、[摘要](browser-summary.md) |
| Web owning suite + Canvas state/realtime/events/collaboration/layout | **76 pass, 0 fail, 0 skip**；[日志](web-tests.log) |
| Server owning suite | **106 pass, 0 fail, 0 skip**；[日志](server-tests.log) |
| 旧 Canvas assignment、Gen UI 状态/权限/重复 ACK、PR204 非思考流、审批/公开事件，真实 PG/Redis | **11 pass, 0 fail, 0 skip**；[结果](server-regression-validation.json)、[日志](server-regression.log) |
| 新 HTTP router + PG CAS/项目权限/机构退出 | **1 pass, 0 fail, 0 skip**；[结果](http-boundary.json)、[日志](http-boundary.log) |
| Web typecheck / lint / production build；server typecheck；E2E typecheck | 通过；[构建日志](build.log)。仅既有 lint/chunk/highlight 提示 |
| PR204 长文本 protocol smoke | [单次合成样本](streaming-smoke.json)：runtime 3.5.5，402 chunks、261331 wire bytes；不作为性能提升、模型 TTFT 或浏览器 p75 证明 |

命令：

```sh
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --cache /tmp/lingxiloop-canvas-npm-cache --no-audit --no-fund
npm run test:e2e:typecheck
npm run lint
npm run build
CI_TEST_FILES='["src/features/canvas/state.test.ts","src/features/canvas/lib/realtime.test.ts","src/features/canvas/lib/events.test.ts","src/features/canvas/lib/collaboration.test.ts","src/lib/canvasLayout.test.ts"]' npm run test
npm run server:typecheck
npm run server:test
node e2e/server/run.mjs --file canvas-public-assignment.test.ts --file visualize.test.ts --file runtime-nonthinking.test.ts --file native-message-approvals.test.ts --file public-run-activity.test.ts
node e2e/server/run.mjs --file canvas-app-boundary.test.ts
E2E_TELEMETRY_DISABLED=1 E2E_CANVAS_CDP_URL=http://127.0.0.1:9291 node_modules/.bin/e2e run --config e2e.canvas-app.config.ts
node --expose-gc --import tsx perf/streaming-20261019/sample.ts . long
```

本地执行环境 Node **24.19.0**、Chromium **154.0.8037.57**；生产 Node 22 的检查由 CI/集成人补充。CDP 使用本机 headless Chromium；`--no-sandbox` 仅为本次容器内浏览器进程启动参数，不改变产品 iframe sandbox。直接启动官方 E2E engine 也可不提供 CDP。配置只跑短测，无重试、无外部 provider。

## 交互与截图

- [保存并显式发送](canvas-mcp-app-saved.png) / [引用待确认](canvas-mcp-app-reference-preview.png)：[interaction JSON](edit-reference.json)，一次初始化；预览/编辑往返 10 次同一 iframe；取消零反馈，显式发送一次；保存不启动 Agent。
- [并发冲突](canvas-mcp-app-conflict.png)：[JSON](conflict.json)，旧 baseRevision 提交不覆盖远端，草稿保留；重载取消继续保留，确认才替换。
- [迟到 ACK](canvas-mcp-app-late-ack.png)：[JSON](late-ack.json)，revision 3 保持，保存中的继续输入不丢失，离开确认取消后草稿仍在。
- [未知 ACK 后重新打开](canvas-mcp-app-restored.png)：[JSON](readback.json)，提交后模拟 503，以读回确认，仅一次应用层 PATCH，重载恢复已保存文档。
- [范围撤销](canvas-mcp-app-scope-revoked.png)：[JSON](isolation.json)，伪造 parent source 不能调用工具；公司切换后移除 srcdoc。
- [真实 App 页面发出的 SDK 请求](capabilities-cancel.json)：6 种非法/未声明能力拒绝；请求取消后迟到 ACK 不投影。取消不是数据库回滚，已到达服务端的写入可能完成。

## 证据边界与排障记录

浏览器 fixture 模拟 API，不能证明服务端授权或生产登录。新 HTTP 测试通过真实路由/权限服务/数据库，但入口身份由测试 helper 注入；它验证真实项目成员资格撤销和机构成员退出，不验证真实网关登录或全局 session 撤销。HTTP fixture 已观察到并发 200/409、旧 revision 409 和持久读回；原聊天壳未更换。

最初环境有 `server/node_modules` 残留运行时 3.5.2/Zod 4.5.4，与根锁定 3.5.5/Zod 4.4.3 冲突。该目录已可恢复地移到 `/tmp/lingxiloop-server-deps-before-canvas`，没有改锁文件。修正前的服务端类型错误和首轮集成结果均不作为放行证据；上表服务器检查来自修正后的重跑。

浏览器探索阶段修复了官方 engine 在缩放 iframe 内 locator tap 的坐标问题（保存用 native pointer 坐标，其余控件验证键盘）和测试异步等待；socket reset 会触发 Chromium 的透明重传，故未知 ACK fixture 改成提交后 503，明确只声称应用层不自动重写。HTTP fixture 起初误把项目 header 当权限边界、把合成认证当真实 session 撤销，并漏设成员退出所需 SUSPENDED 状态；均已按实际 owner/权限/schema 校正，未放宽产品防护。

未验：真实 provider 回合、真实登录后的完整多人页面旅程（既有 `e2e/web/canvas.e2e.ts` 已更新显式保存选择器）、Electron/移动端、长 soak、所有路由的未保存草稿恢复，以及通道故障/异常导航的全分支故障注入。独立审查、CI 精确最终 commit、生产部署与 Komodo 回执由父任务/唯一集成人完成。本配置不是完整官方 UI Plugin 等价验收。
