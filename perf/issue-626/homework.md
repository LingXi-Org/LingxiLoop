# 课程概览：作业读取与服务端验证

工作区：`E:/lyyzka/LingxiLoop-perf-20261102`，基线提交 `0d231b60`。

## 改动

- 教师概览不再请求未使用的课程详情或逐份作业详情；仍读取有权限的学生列表和全部分页。
- 学生概览改用 `GET /courses/:courseId/homeworks/:homeworkId/overview`，仅返回自身作业 `status`、`latestSubmission`。
- 新接口沿用作业详情的课程读取、租户、课程归属、教师权限和发布状态检查。它复用 `studentHomeworkView(..., { readLearningRecord: false })`，避开概览不需要的私人 IM 学习记录扫描，不返回未经完整计算的 `hasLearningRecord` 或 `canSubmit`。
- 普通作业详情及提交、报告流程不变。无数据库迁移。

## 已执行

1. `node --import tsx --experimental-test-module-mocks --test --test-force-exit src/features/learning/dashboard/useCourseOverview.test.ts`
   - 实现前：2 通过、1 失败；学生测试明确发现仍调用 `detail:homework` 而非 `overview:homework`。
   - 实现后：3/3 通过，覆盖教师完整分页、无审核权限的教师、学生状态及最新提交。
2. `npx --no-install biome lint src/AuthedApp.tsx src/components/WorkspaceChrome.tsx src/desktop/DesktopApp.tsx src/features/learning/dashboard/LearningDashboardPanel.tsx src/features/learning/dashboard/CourseOverviewDashboard.tsx src/features/learning/dashboard/useCourseOverview.ts src/features/learning/dashboard/useCourseOverview.test.ts src/features/learning/homework/api.ts src/features/learning/homework/contracts.ts server/src/modules/learning/homework-application.ts server/src/modules/learning/homework-router.ts server/src/__integration__/homework.test.ts`
   - 12 个文件通过，无自动修改。
3. `git diff --check`
   - 通过。
4. `npm run test:integration -- --file homework.test.ts`
   - 首次在加载运行器时因缺少 `dotenv` 失败，尚未执行测试。
   - 按锁文件版本安装 `dotenv@17.4.2` 后重跑：运行器正确选择 `homework.test.ts`，随后输出 `INTEGRATION_DATABASE_URL is required; use a dedicated test database.` 并退出；没有执行或通过集成断言。
5. `npm run server:typecheck`
   - 失败。当前共享依赖目录缺少 Express、compression、ws 的类型声明以及 AWS SDK 包；另有现有 LingxiOS `publicAnswerTool: native-v3` 与已安装类型仅支持 `native-v1 | native-v2` 的不兼容诊断。不能报告服务端类型检查通过。
6. `docker info --format '{{.ServerVersion}}'`
   - 失败：`dockerDesktopLinuxEngine` named pipe 不存在；本机 `com.docker.service` 为 `Stopped`。未发现 PostgreSQL/Redis 命令或服务，也没有配置 `INTEGRATION_DATABASE_URL`、`REDIS_URL`。

## 集成覆盖与剩余条件

已在现有 `server/src/__integration__/homework.test.ts` 增加：草稿不可由学生读取、跨租户和跨课程不可读取、教师返回空学生视图、学生只取得自身状态、私人学习对话不可用时概览仍能读取持久化状态而完整详情继续拒绝、提交后的概览与详情最新提交完全一致。

这些新增集成断言尚未在本地执行；随后已在下述 PR CI 的隔离数据库中通过。若在本地重现，需要完整锁文件依赖、专用测试 PostgreSQL 和显式测试 Redis，再运行上述集成命令；运行器会清空测试库，不能使用生产数据库。

本地仅为验证补齐缺失的锁定依赖：

```powershell
npm install --prefix .codex-tmp/homework-check-deps --package-lock=false --ignore-scripts --no-audit --no-fund dotenv@17.4.2
New-Item -ItemType Junction -Path E:/lyyzka/LingxiLoop/node_modules/dotenv -Target E:/lyyzka/LingxiLoop-perf-20261102/.codex-tmp/homework-check-deps/node_modules/dotenv
```

`package.json`、`package-lock.json` 未改动；未连接生产、未部署。

## CI 夹具修正

CI run `41409093523` 执行了新增用例，但在 `published()` 夹具检查中失败：验证状态为 `ERROR`，预期为 `READY`。新用例先创建了用于权限检查的未发布草稿，其待处理验证任务消耗了 `published()` 准备的唯一模拟模型响应，导致后创建的发布夹具验证失败。

修正仅将 `published()` 移到独立草稿创建之前，先完成发布夹具的验证任务；原有权限、状态和详情访问断言全部保留。修正后执行 `npx --no-install biome lint server/src/__integration__/homework.test.ts` 和 `git diff --check`，均通过；本地仍无专用测试数据库，集成结果以随后 CI 重跑为准。

后续验证：提交 cf7f4068 的 CI [41409823905](https://github.com/LingXi-Org/LingxiLoop/actions/runs/41409823905) 已全部通过，包括 web、server、deploy-contract 和选中的数据库集成检查。此成功结果与前述本地环境阻塞、首次测试夹具失败分别记录。
