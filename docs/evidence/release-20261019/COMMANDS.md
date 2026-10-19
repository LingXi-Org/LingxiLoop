# 复验命令索引（本次整理未执行）

命令来自已完成的验收记录。先检出各记录中的精确源提交并使用精确官方 3.5.3 包。集成 runner 会清理测试数据，必须使用专用空测试数据库和独立 Redis；合成环境值、缓存绝对路径与凭据不包含在公开包中。设置 DOTENV_CONFIG_PATH 禁用真实环境文件载入，停用非目标 live provider；网页与浏览器也使用隔离 fixture。以下不含安装、部署或发布命令。

问卷：

```bash
node server/run-integration-tests.mjs --file questionnaire-wait.test.ts --file im-conversation-style.test.ts --file native-message-flow.test.ts --file native-message-approvals.test.ts --file im-send-reconciliation.test.ts --file interactive-ui-disabled.test.ts --file migration.test.ts
node scripts/run-tests.mjs server
CI_TEST_FILES='["src/api/questionnaires.test.ts","src/features/chat/runtime/error-recovery.test.ts","src/features/chat/runtime/history-loading.test.ts","src/features/chat/runtime/run-updates.test.ts","src/features/chat/runtime/transport.test.ts"]' node scripts/run-tests.mjs web
npm run server:typecheck
npm run server:lint
npm run typecheck
npm run test:e2e:typecheck
NODE_ENV=production node node_modules/vite/bin/vite.js build --config e2e/vite.questionnaire.config.ts --mode questionnaire-test
```

启动该新构建的隔离 preview 后，将 E2E_BASE_URL 绑定到它，设置 E2E_PROJECT=web、E2E_TELEMETRY_DISABLED=1、E2E_BUILD_INDEX=.e2e/questionnaire-site/e2e/questionnaire.html，并使用已缓存的官方浏览器执行：

```bash
node e2e/web/run.mjs e2e/web/questionnaire.e2e.ts --output .e2e/pr190-official-3.5.3
```

案例与论坛：

```bash
node docs/evidence/issue-187/live-case-agent/run.mjs owning organization-cases.test.ts knowledge-vertical-slice.test.ts attachment-answers.test.ts migration.test.ts
node docs/evidence/issue-187/live-case-agent/run.mjs live
node e2e/server/cases.mjs --browser-only
node e2e/server/forum.mjs --browser-only --issue184
node e2e/server/forum.mjs --browser --issue187
```

Provider（首轮、独立单项分别记录；真实模型命令需已有授权凭据绑定，不能在无授权时自动执行）：

```bash
node scripts/runtime-acceptance/provider-fault-matrix.mjs
node scripts/runtime-acceptance/provider-fault-matrix.mjs runtime-deadline-recovery.test.ts
node --use-env-proxy e2e/server/model-switch.mjs --live
```

本包不携带真实凭据或 live 消息。四次模型调用和 usage 成本仅引用验收摘要。
