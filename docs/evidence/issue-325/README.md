# #325 教师论坛发布入口恢复

## 根因与修复边界

论坛头部「发布作业」先进入教师 Agent 房间；它不调用论坛帖子创建或学生提交接口。原 GET `/courses/:courseId/teacher-agent` 只读已有房间；最新 main 的生产调用链没有执行 `ensureTeacherAgentForCourse`，缺房间的课程因此返回 404，`teacher_room.sync` 对缺房间也直接退出。旧测试预先手工创建房间，未覆盖首次进入。原「重试」只重新加载论坛列表，不能重试这个入口。

新增显式 POST 准备入口，在同一事务内锁定授权依赖，校验组织、课程管理权限、真实课程教师成员与 ACTIVE 状态，然后复用确定性教师房间配置，并仅恢复当前教师该房间的列表显示。同步使用现有持久 effect，不在请求内访问外部服务。GET 保持只读；不创建作业或修改既有草稿，不新增课程角色，不执行数据库迁移。

前端独立呈现入口错误并真正重试入口；重复点击受同步请求引用保护，课程、组织、用户或页面变化后取消请求并丢弃迟到导航。房间列表刷新失败不会被伪装成资源 404；详情页也能看到重试。

这是对源码中可复现缺陷的根因修复。原反馈没有 Network 证据，不能据此断言用户那一次请求的具体失败阶段。

## 可重复验证

```sh
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run server:lint
npm run server:typecheck
npm run server:test
npm run test:e2e:typecheck
node e2e/server/run.mjs --file homework.test.ts --file course-forum.test.ts
node e2e/server/forum.mjs --browser-only --issue325
```

浏览器使用仓库规定的 `e2e` / `@e2e-dev/web`。本次连接系统 Chromium 154 的 loopback CDP（`E2E_CDP_URL=http://127.0.0.1:53325`）；官方浏览器下载地址在此环境直连失败。Node 为 24.19.0，CI 使用仓库规定的 Node 22。隔离的 PostgreSQL/Redis、合成身份、录制 WuKong 与内存对象存储均沿用论坛 fixture。

新增后端回归覆盖首次准备、并发复用、仅恢复调用者隐藏状态、既有草稿保持、学生/其他课程/其他租户/撤权/无课程教师身份的管理员拒绝，以及非 ACTIVE 课程拒绝。浏览器三条旅程覆盖：

1. 头部入口首次缺房间、提交后响应丢失、重试同一房间、正文和附件保留、隐藏房间恢复、详情页列表刷新失败后的重试。
2. 请求等待时切换课程，完成后不跳回旧课程；学生不显示教师入口且直接请求被拒绝。
3. 真实作业卡片保存要求与附件、发布提交后响应丢失、相同幂等键重试只发布一份，刷新及学生重新进入均可读回。

第三条使用合成的草稿工具结果与显式 READY fixture，执行真实保存/发布/读取事务；不证明模型生成、真实身份登录或生产对象存储。学生提交 #311 不在此次修复范围。

`validation.json` 仅保留结果与源文件 SHA-256；完整本地报告、JUnit 和合成截图由 runner 写入 `artifacts/forum/issue325/`，不提交原始日志或用户截图。独立审查与最终提交的 GitHub CI 结果随 PR 交接。

## 唯一发布者后续验收

开发验证不依赖生产诊断。本任务不合并、不部署。发布者在集成后使用现有授权教师测试身份，从实际课程论坛头部进入，确认同一课程的草稿卡片可保存、明确确认发布后仅一份作业、刷新及学生身份可读回，并保留原有无权/撤权拒绝。

若原问题仍出现，仅需脱敏探针：请求方法、路由模板、HTTP 状态、业务错误码、request/trace ID、发布镜像/提交；课程到项目映射是否匹配、项目状态、当前教师成员是否有效、room/agent/binding 是否存在且有效、调用者是否在房间成员与隐藏列表中（均只输出布尔值或不可逆标识）。按 teacher-agent 准备、`/im/channels` 刷新、明确发布三个阶段分别记录。禁止返回 Cookie、Token、正文、附件内容、对话内容、用户截图或原始日志；由唯一集成发布者执行。
