# 案例库与论坛五页验收

本目录保存本次真实 HTTP API、隔离 PostgreSQL 和官方 `@e2e-dev/web` 浏览器运行的结果。使用合成身份及内存对象存储；未写入生产数据。

## 检查结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 案例浏览器回归 | 6 / 7 通过；1 项剪贴板写入失败 | [报告](cases-report.json)、[JUnit](cases-junit.xml)、[驱动结果](cases-results.json) |
| 论坛完整流程 | 1 / 1 通过 | [报告](forum-core-report.json)、[JUnit](forum-core-junit.xml) |
| 论坛布局与详情入口 | 1 / 1 通过 | [报告](forum-layout-report.json)、[JUnit](forum-layout-junit.xml) |
| 教师助手与独立发布 | 3 / 3 通过 | [报告](forum-teacher-report.json)、[JUnit](forum-teacher-junit.xml) |
| 案例服务端集成 | 11 / 11 通过 | [完整 TAP](cases-integration.txt) |
| 改动生产 TS/TSX 定向 lint | 通过，6 文件 | [输出](lint.txt) |
| 前端 typecheck | 通过 | 根 tsconfig 与 tsconfig.node.json 均退出 0 |
| 服务端 typecheck | 未通过 | [错误](server-typecheck.txt) |
| E2E typecheck | 未通过 | [错误](e2e-typecheck.txt) |

合并主线 f8b452fd 后，依赖按锁重新安装为 LingxiOS 3.8.11，旧的本轮隔离测试库重命名保留，再由仓库驱动创建新库。前端 typecheck 与生产文件 lint 再次通过。

服务端类型错误位于未改动的 `callback-deadlines.test.ts`、`runtime-model-context.test.ts`、`activity-tool.ts` 和 `im/router.ts`。E2E 检查还报告 `e2e/forum/api.ts` 的根目录／server OpenAI 类型身份冲突，以及主线 `e2e/react-delivery/recovery.e2e.ts` 与聊天 runtime 的别名／类型错误。Zod 错误指向 4.4／4.5 类型不一致。本次未修改依赖锁或绕过类型检查；完整错误保留在上面的文件中。

## 已观察到的失败与复跑

- 案例 7 个场景中，原有 3 个页面流程、旧 Markdown／原生文档兼容、VS Code 原样粘贴和草稿隔离共 6 个通过。剩余代码块流程已完成粘贴、预览、发布、重开和二次修改的断言，随后点击原生复制时显示“复制失败，请选择代码后复制。”，因此“已复制”断言失败，其后的模拟失败／成功断言未执行。串行运行仍失败，不能归因于并行浏览器。[失败屏幕](case-clipboard-failure-screen.txt)、[截图](screenshots/failure.png)；[首次报告](cases-initial-clipboard-failure.json)。
- 论坛完整流程首次因自动化清空未删除恢复的旧草稿而失败；改为真实键盘全选、删除并断言为空后，完整流程通过。[首次报告](forum-initial-draft-clear-failure.json)与最终报告均保留。

## 覆盖范围

- 案例：加载、失败重试、空筛选、分类与关键词、三列等高封面、长标题、组织权限、跨课程访问、上传、BlockNote 原位编辑、未保存预览、保存重开、发布、下架。
- BlockNote：通过原生 UI 创建标题、表格、代码和图片；保存后读取真实 API 文档，并在重开、再保存后比较完整 JSON。旧 Markdown 仍走兼容阅读路径。
- 作者：创建者关联的 ID、姓名、头像在其他教师修改并发布后保持一致；列表与详情均检查。
- 论坛：分类、日期／归档筛选、排序设置、默认摘要／完整显示切换、讨论草稿、编辑、任务清单、回应、评论、提交、私有历史、附件权限、教师反馈、关闭作业。
- 详情：顶部提交／进度入口滚动并聚焦现有区域，返回后恢复标题链接焦点；详情菜单编辑与保存保留当前位置。
- 五页截图覆盖 1774×887、1440×887、768×887、390×887；另有 390px 暗色与键盘焦点、错误和空状态截图。全页横向溢出及案例列数有浏览器断言。

## 截图入口

| 页面 | 桌面 | 窄屏 |
| --- | --- | --- |
| 案例库 | [1774](screenshots/student-editorial-grid-light.png) | [768](screenshots/case-grid-768.png)、[390](screenshots/case-grid-390.png) |
| 案例阅读 | [1774，教师已发布](screenshots/teacher-authored-published-article.png) | [390](screenshots/case-reading-390.png) |
| 案例编辑 | [1774](screenshots/case-inline-editor-1774.png) | [390](screenshots/case-editing-390.png) |
| 论坛列表 | [1774](screenshots/forum-scope-navigation-1774.png) | [390](screenshots/forum-scope-navigation-390.png) |
| 论坛详情 | [1774](screenshots/forum-document-1774.png) | [390](screenshots/forum-document-390.png) |

[案例暗色键盘焦点](screenshots/mobile-dark-single-column-keyboard.png) · [论坛暗色](screenshots/forum-mobile-dark.png) · [教师验收入口](screenshots/native-homework-review-entry.png)

## 重复运行

在本分支工作目录安装仓库锁定的根目录与 server 依赖，启动仓库的隔离数据库服务：

```powershell
docker compose -f e2e/server/compose.yaml up -d --wait
node e2e/server/cases.mjs --browser-only
node e2e/server/forum.mjs --browser-only --core-only
node e2e/server/forum.mjs --browser-only --issue187
node e2e/server/forum.mjs --browser-only --issue325
```

论坛驱动使用同一隔离测试库及端口，必须串行运行。案例剪贴板失败已单独串行复现，未通过更改浏览器权限或替换原生写入绕过。驱动会初始化测试数据，不能指向开发或生产数据库。浏览器报告重生于 `artifacts/cases/browser`、`artifacts/forum/core/browser` 和 `artifacts/issue-187/forum/browser`。

作者集成使用另建的 `lingxiloop_visual_integration_test` 数据库，连接到同一 compose 的 `127.0.0.1:55432`。使用 compose 的本地测试账号；设置 `DATABASE_URL` 和 `INTEGRATION_DATABASE_URL` 为该专用库，`REDIS_URL=redis://127.0.0.1:56379/9`、`NODE_ENV=test`、`DOTENV_CONFIG_PATH` 为不存在的测试路径、`OPENAI_API_KEY=isolated-visual-test`、`OPENAI_BASE_URL=http://127.0.0.1:1/v1`、`OPENAI_EMBEDDING_MODEL=disabled`、`LINGXILOOP_DISABLE_EMBEDDINGS=1`、`OPEN_NOTEBOOK_ENABLED=false`，并提供合成 `WUKONG_USER_TOKEN_SECRET`、`LINGXILOOP_GATEWAY_HMAC_SECRET` 和 `LINGXILOOP_INVITE_BASE_URL=http://127.0.0.1:53108`。清空 `RESEND_API_KEY`、`ALERT_WEBHOOK_URL` 后运行：

```powershell
node --import tsx server/src/migrate-bin.ts
node server/run-integration-tests.mjs --file organization-cases.test.ts
```

类型及 lint 使用仓库脚本对应的本地可执行文件。本机 npm 子进程曾无法解析 `.cmd`，因此直接通过 Node 调用同一个已安装版本：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.node.json --noEmit
node node_modules/typescript/bin/tsc -p server/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p e2e/tsconfig.json
node node_modules/@biomejs/biome/bin/biome lint src/features/cases/CasesPage.tsx src/features/cases/api.ts src/features/learning/forum/CourseForum.tsx src/features/learning/forum/memos/MemoDetail.tsx src/features/learning/forum/memos/MemoDisplaySettings.tsx server/src/modules/cases/application.ts
```

## 限制

未运行全仓构建、全量测试、完整 issue219 编辑器套件或线上端到端检查。未部署。模型评阅、真实对象存储和 Open Notebook 外部摄取不在本轮视觉验收范围内。浏览器运行报告无 runner errors，但未另行采集完整控制台日志。

案例测试沿用极小白色 PNG 上传夹具，同时覆盖无封面状态；它能验证权限、图片加载及文档保存，不能证明真实摄影图片的主体裁切效果。所有示例内容仅存在于测试代码与隔离测试库。详细视觉差异记录见根目录 [design-qa.md](../../design-qa.md)。
