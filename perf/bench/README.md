# 复测与性能上限

使用仓库既有 `e2e` / `@e2e-dev/web`。需要 Node、npm、Docker、Chrome；不直接调用 Playwright。只连接本地隔离 E2E 服务，禁止把测试会话和种子消息送入生产。

1. 按 `e2e/local-api.mjs` 和 `e2e/admin/start-control.mjs` 的既有流程启动测试 API/control Worker 与依赖服务。当前 fixture API 为 5181、control 为 8797。
2. 在改动前后分别构建，两个构建必须使用相同环境变量、压缩与后端。基线不可覆盖。PowerShell 示例（候选把 outDir 改为 `.e2e/perf-candidate`）：

```powershell
$env:LINGXILOOP_DEV_API_TARGET='http://127.0.0.1:8797'
$env:VITE_TURNSTILE_SITE_KEY='1x00000000000000000000AA'
node node_modules/vite/bin/vite.js build --config perf/bench/vite.config.ts --outDir .e2e/perf-base
node node_modules/vite/bin/vite.js preview --config perf/bench/vite.config.ts --outDir .e2e/perf-base --host 127.0.0.1 --port 5180 --strictPort
# 另一个进程预览 candidate，同样命令，目录改为 perf-candidate，端口改为 5198。
```

3. 启动独立 Chrome，使用 `--headless=new --remote-debugging-port=9239 --user-data-dir=<绝对路径>/.e2e/perf-chrome`。不要附着个人浏览器，不要关闭安全软件。工具只用 CDP 设定网络/CPU/缓存；所有页面操作由官方 E2E engine 执行。
4. `PERF_SETUP=1` 运行下列 E2E 命令，保存本地一次性登录 cookie；首次添加 `PERF_SEED_CHAT=1` 创建 6 条固定历史消息。种子可能产生代理任务，使用 UI“停止全部”或正常 run cancellation API 取消这 6 个测试任务，避免无 worker 的 HTTP/1 本地环境留下长期流连接。后续复测不要再次发送历史。测试会话在 `.e2e/perf-session.json`，不得提交。
5. 清除 setup 环境变量，停止构建等占用 CPU 的任务，再采样。每次新建输出目录，避免读取旧样本。以下示例用 PowerShell；其他 shell 使用等效环境变量。

```powershell
$env:PERF_RUNS='10'
$env:PERF_OUTPUT='perf/bench/results'
npx --no-install e2e run --config e2e.perf.config.ts
# 手机布局/实际输入；此轮只检验布局，不作统计速度结论。
$env:PERF_RUNS='1'; $env:PERF_WIDTH='390'; $env:PERF_OUTPUT='perf/bench/mobile'
npx --no-install e2e run --config e2e.perf.config.ts
Copy-Item perf/bench/mobile/*-390-* perf/bench/results/
node perf/bench/report.mjs perf/bench/results --check
```

`--check` 拒绝缺失/非数值样本、每组不足 10 次、缺失双宽度截图、可见文字或输入框几何改变、超过 0.5% 的像素变化，以及候选 p75 超过上限或配对基线、CLS 超过配对基线 0.01。首键时间包括自动化定位与往返，不是 INP。截图等待字体加载，并禁用动画、光标及第三方验证 iframe 的视觉随机性；交互与速度测量发生在该处理之前。

功能护栏：`PERF_GUARDS=1` 运行同一 E2E 命令。已知原始基线的手机草稿返回失败会使完整护栏退出非零；不得把这个失败静默当作通过。可用 `PERF_BASE_URL=http://127.0.0.1:5180` 复核基线。交互教学使用现有 `e2e/web/interactive-ui.e2e.ts` 与 `e2e/vite.interactive.config.ts`，包含 NativeMessageContent 的课程入口。

`ratchet.json` 只适用于记录的机器/网络/数据口径；CI 换机器应先固定同口径基线，再收紧上限。不要为使检查变绿随意放宽。当前未把有状态的本地浏览器基准硬接到普通 CI。
