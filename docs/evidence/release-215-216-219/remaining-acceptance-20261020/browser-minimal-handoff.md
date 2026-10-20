# #214 / #218 / #219 最小浏览器验收交接（只读准备）

2026-10-20。准备者未启动浏览器、未修改源码、未执行生产 API、未改安全配置、未触碰固定 runtime 3.5.3 观察。以下命令是交接给执行者的命令，不是本次通过证据。

## 固定源码与环境

- 最终候选：`/workspace/LingxiLoop-maintenance-host-source`，分支 `release/canvas-host-20261020`，HEAD **`9a5cfda82ad105d666bf0452df1d615daf6c6a28`**。此次读取时工作树干净。父线程确认应用部分与 accepted main754 相同；不要切换/修改发布者当前分支。
- 根 `node_modules` 已指向 `/workspace/LingxiLoop-integration-215-216-219/node_modules`。已有 `e2e@0.17.0`、`@e2e-dev/web@0.12.0`；无需 npm ci、安装浏览器或复制依赖树。
- Node 22：`/workspace/.tools/node-v22.23.3-linux-x64/bin/node`。
- 已存在浏览器：`/workspace/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`；另有 `/workspace/.lingxi-setup/cache/ms-playwright`。`/workspace/.cache/e2e-browsers` 当前不存在，勿盲用旧文档路径。
- 已读 `AGENTS.md`、`/tmp/pr220-root-node_modules-20261020/e2e/skills/e2e/SKILL.md` 及 `references/running.md`、`references/setup.md`，以及当前 `node_modules/@e2e-dev/web/README.md`、`dist/surface.d.ts` / `dist/browser.d.ts`。
- 全部测试操作继续使用官方 `@e2e-dev/web` / `e2e`。不直接 import/call Playwright，不导入引擎内部 `PlaywrightSurface`。

每个执行者在自己的独立 checkout 执行下面准备（不要往发布工作树添加新测试）：

```sh
cd /workspace/LingxiLoop-maintenance-host-source
export PATH=/workspace/.tools/node-v22.23.3-linux-x64/bin:$PATH
export XDG_CACHE_HOME=/workspace/.cache
export E2E_TELEMETRY_DISABLED=1
export HANDOFF_RUN=$(date -u +%Y%m%dT%H%M%SZ)
git rev-parse HEAD
```

`node node_modules/e2e/dist/cli/bin.js list ...` 可先查看精确选中数，不启动浏览器或 app。输出必须位于项目目录内；每次用新目录，不能覆盖旧失败记录。现有根 `e2e.config.ts` 支持 `E2E_BASE_URL`（指定后不会 build/启动 app）和 `E2E_CDP_URL`。下面可并行分配 A/B/C，但各自独立 Vite cache、输出；不同时跑性能短测。若端口已占用，改为另一个明确空闲端口，同时修改 BASE_URL，不杀不明进程。

## A：#214 —— 原生减少动画 1 例 + 官网 1 例

### 现成官网命令（精确 1 例，无本地 server）

```sh
E2E_PROJECT=web E2E_OFFICIAL_STREAMING=1 E2E_BASE_URL=https://www.assistant-ui.com \
node node_modules/e2e/dist/cli/bin.js run e2e/web/streaming-text-official.e2e.ts \
  --config e2e.config.ts --workers 1 --retries 0 --video on \
  --output "artifacts/remaining-214-official-$HANDOFF_RUN"
```

文件 `e2e/web/streaming-text-official.e2e.ts:7`：进入真实 `/elements/streaming-text`，断言官方 element 1 个，记录 replay/restart 按钮及实际 DOM并截图。它没有点击 replay；若要求动态官网对照，最小增加官方实际可见 replay/restart 操作并录像，不能把单张静态截图声称动态对照通过。网页可达后核对 500ms 入场、700ms 颜色过渡、尾部光标与本地同输入录像；网页结构改变时保留失败，不改成只断言页面可达。

已有产品/固定官方源码同输入 1 例（不是 live 网站）：

终端 1：
```sh
LINGXILOOP_VITE_CACHE_DIR="$PWD/node_modules/.vite-remaining-214-$HANDOFF_RUN" \
node node_modules/vite/bin/vite.js --config e2e.final-combination.vite.config.ts \
  --host 127.0.0.1 --port 53119 --strictPort
```
终端 2（同一 HANDOFF_RUN 可独立设置，但 BASE_URL 必须一致）：
```sh
E2E_PROJECT=web E2E_STREAMING_FIXTURE=1 E2E_BASE_URL=http://127.0.0.1:53119 \
node node_modules/e2e/dist/cli/bin.js run e2e/web/streaming-text.e2e.ts \
  --config e2e.config.ts --grep 'same input retains upstream entry, color transition and caret styles' \
  --workers 1 --retries 0 --video on --output "artifacts/remaining-214-product-$HANDOFF_RUN"
```

### 原生 reduced-motion 的真实能力与最小补丁

**当前公开接口没有 `reducedMotion` / `emulateMedia` / `launchArgs` / 原生 CDP send 方法。** 不存在可直接加给 `web()` 的已支持 media flag。根配置的官方 `connect.cdpEndpoint` 是可用入口：连接已经由宿主正确配置媒体偏好的 Chromium，页面操作仍全部走官方引擎。

`e2e/web/streaming-text.e2e.ts:87` 的现有减少动画测试会改写 `window.matchMedia`，只证明 JS reveal 队列；不能拿它当 CSS media 验收。最小新增测试在独立分支复制这一用例但**删除 addInitScript stub**，增加两项前置断言：

1. 原生 `matchMedia('(prefers-reduced-motion: reduce)').matches === true`；
2. 添加一个只用于观察的 CSS custom-property media probe，默认 `--acceptance-native-reduce:no`、在 `@media(prefers-reduced-motion:reduce)` 下值 `yes`，读取 `getComputedStyle(document.documentElement)` 必须为 `yes`。probe 不改产品动画。

然后复用已有 280 字突发/完整输出与无中间 reveal 断言；实际测 `[data-streaming-word]` / `[data-streaming-caret]` / `::after` 的 animation/transition，保留原生值和截图，核对 `src/styles/chat.css` 及全局减少动画规则确实生效。完成/取消无需再扩整套，只在同一例收尾确认无残留光标。不要运行普通态的 `same input...` 用例来验减少动画，因为它明确期望 0.5s/0.7s。

宿主可用且安全沙箱正常时，可由执行者在全新临时 profile 使用原生 Chromium `--force-prefers-reduced-motion`；本次只读确认该字符串存在于当前 Chromium 二进制，**未执行、未证明此环境能启动**。这是浏览器原生媒体覆盖，不应称物理 OS 偏好验收。示意启动命令没有任何安全绕过：

```sh
export HANDOFF_CHROME_PROFILE=$(mktemp -d /tmp/lingxi-native-media.XXXXXX)
/workspace/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
  --headless --force-prefers-reduced-motion --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=53129 --user-data-dir="$HANDOFF_CHROME_PROFILE" \
  about:blank
```

另一个终端将 `E2E_CDP_URL=http://127.0.0.1:53129` 传给根 config，选跑新增 native-media 例。必须通过上述 JS+CSS 双前置断言才能称原生 media 生效。若 `No usable sandbox`，立即保留 stderr 并停止此路径；不加 `--no-sandbox`、不调整 userns/AppArmor/权限。使用已经可用且沙箱正常的测试浏览器环境可以完成；当前环境没有这样的成功证据。

已有边界证据：`docs/evidence/issue-214/README.md:28`、`official-live-blocked/{junit.xml,report.json.gz,summary.md}`；最近官网失败见 `docs/evidence/release-215-216-219/formal358/pr234-review/REVIEW.md`，run `01a158aa-b5c8-7c93-b285-972be9835e39`，1 例 0 pass、ENGINE_FAILURE / ERR_CERT_AUTHORITY_INVALID。不能关闭 TLS 校验重试。

交付：原生 media 1 例 report+JS/CSS值+PNG/WebM；真实官网 1 例及与产品对照结论。当前没有新增已证明功能缺陷，待补是这两个基础验收。

## B：#218 —— 两尺寸各状态展开 + 真实官网 1 例

产品 fixture 与 A 相同可共用只读 Vite 服务，也可用独立端口/cache。`e2e.final-combination.vite.config.ts` 预热 `@lyyzka/lingxios/ui`，避免首次 optimize 引起页面重载。

现有产品两例：
```sh
E2E_PROJECT=web E2E_ACTIVITY_FIXTURE=1 E2E_BASE_URL=http://127.0.0.1:53119 \
node node_modules/e2e/dist/cli/bin.js run e2e/web/activity-presentation.e2e.ts \
  --config e2e.config.ts --grep 'known aliases, persisted generic titles and distinct official cards' \
  --workers 1 --retries 0 --video on --output "artifacts/remaining-218-product-$HANDOFF_RUN"
```

`e2e/web/activity-presentation.e2e.ts:39` 覆盖 390/1440，打开 run/tool group，打开一次“已完成 查看可视化参考”，核对 8 个本地化工具名、memory chips、web-search、无内部名/横向溢出，切换 running/failed/cancelled/unknown 并截图。**这些状态目前只断言标题，不逐项展开详情。** 最小改动在同两例中：每种状态点击实际 card trigger，断言 `aria-expanded`、可见详情/正确状态语义，截图展开与收起；保留取消/未知不显示失败/已完成误导的原断言。fixture 是 `/e2e/run-activity.html?catalog=1`，源码 `e2e/run-activity.tsx`，现有公开 synthetic 文本“合成执行记录。”；运行中不应被强加完成结果内容。可加 `&theme=dark` 对一个尺寸补暗色，不需要再跑 provider 或短测预算例。

真实官网现成 1 例：
```sh
E2E_PROJECT=web E2E_ACTIVITY_FIXTURE=1 E2E_BASE_URL=https://www.assistant-ui.com \
node node_modules/e2e/dist/cli/bin.js run e2e/web/activity-presentation.e2e.ts \
  --config e2e.config.ts --grep 'official reference components' \
  --workers 1 --retries 0 --video on --output "artifacts/remaining-218-official-$HANDOFF_RUN"
```

该例 `:65` 依次访问官方 `/elements/memory-chips`、`/elements/web-search`、`/elements/run-activity` 并截图，尚未展开官网详情/断言官方内容 ready。最小补充：等待实际 component ready，依据现场可访问树展开真正的 details/trigger，记录展开/收起后截图；和产品两尺寸对照布局、图标、层级、详情行，不把本地上游源码当 live 网站。

已有失败 `docs/evidence/issue-215-218/browser-presentation-including-reference-failure.md` 为第一站 memory-chips `ERR_CERT_AUTHORITY_INVALID`。如同环境同错误，无新授权/新网络条件不要无穷重试或忽略证书。成功产品证据在同目录；官网失败不是产品渲染缺陷。

交付：2 个产品例扩充详情断言 + 1 个真实官网例截图/对照。无需重新跑接收耗时/整个 web suite。

## C：#219 —— 原生减少动画下菜单和导航

现有固定配置 `e2e.native-content.config.ts` / `e2e.forum.config.ts` / `e2e.cases.config.ts` 都只创建 managed Chromium，**不读取 E2E_CDP_URL**。三套 DB runner 又只保留少量环境变量，**会丢弃 E2E_CDP_URL / PLAYWRIGHT_BROWSERS_PATH**。不能只 export 变量后跑旧命令而声称偏好生效。

最小实现：独立测试分支为所选配置增加与根配置相同的公开 `connect` 接口；需要 runner 时显式传递该变量；在少量所选测试开头复用 A 的 JS+CSS 原生媒体前置断言。或者单独 acceptance config 指向已启动 fixture，用同一官方接口。没有产品 bug 时只提交验收测试和证据。

### 最小无 DB 菜单任务（2 例，不必启动迁移）

`e2e/content-editor/browser.e2e.ts:22` 的 `upstream native schema, slash menus, tables, blocks, undo and lossless reopen`；`:97` 的 `native formatting, links, emoji, block menu and table operations remain complete`。fixture `/e2e/content-editor.html` 使用真实产品 editor + synthetic localStorage persistence，不需要业务 API。另启动 Vite：

```sh
LINGXILOOP_VITE_CACHE_DIR="$PWD/node_modules/.vite-remaining-219-native-$HANDOFF_RUN" \
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 53109 --strictPort
```

现有普通态可用命令（补上 native-media 前置和 connect 后才覆盖减少动画）：
```sh
node node_modules/e2e/dist/cli/bin.js run --config e2e.native-content.config.ts \
  --grep 'upstream native schema, slash menus|native formatting, links, emoji' \
  --workers 1 --retries 0 --video on --output "artifacts/remaining-219-native-$HANDOFF_RUN"
```

复用真实 `/` 菜单、键盘 Enter/Escape、格式/链接/emoji/块菜单/表格，确认焦点可见、关闭后焦点正确、无动画阻止点击。此例不代表案例/论坛业务导航。

### 真实本地业务服务命令与最小导航选择

已存在服务编排：
```sh
docker compose -f e2e/server/compose.yaml up -d --wait
XDG_CACHE_HOME=/workspace/.cache node e2e/server/forum.mjs --browser-only --states-only
```

这是已有最小导航 **1 例**：`e2e/forum/issue219-states.e2e.ts:4`，loading/retry/empty + mobile keyboard。真实 API53097、Vite53098、专用 DB `lingxiloop_forum_test` / Redis DB4；runner 会应用迁移两次，然后启动/清理本次服务。需独立分支修改媒体 connect/透传，否则只是重跑已通过普通态。

更广的旧命令仅供定位，不要求全部重跑：
- `node e2e/server/forum.mjs --browser-only --issue219`：3例，原生发布菜单/私有反馈/homework；第一例位于 `e2e/forum/issue219.e2e.ts:21`。
- `node e2e/server/cases.mjs --browser-only`：3例，API53107/Vite53108、DB `lingxiloop_cases_browser_test`、Redis DB5；需要案例导航时选 `e2e/cases/browser.e2e.ts:30`（organization case publication...responsive navigation）。现有 driver 不接受 `--grep`，不得随手追加；需小改 runner 精确转发，或沿用它已核验的隔离 env 启动服务后直接 CLI `--grep`。不要复制生产 env。
- `node e2e/server/content-editor.mjs --browser-only`：4例，并非菜单任务必要；它也迁移 DB `lingxiloop_content219_test`。上面的纯前端2例避免无意义重做 DB 迁移。

forum 两个 driver 不能并跑（同端口/库/输出）；content/cases 也共享 Redis DB5，避免同时执行。固定输出会覆盖旧文件，执行前保留历史或使用独立 checkout/小改接受独立 output。不要对生产连接运行任何这些 runner。

已有 `docs/evidence/issue-219/ACCEPTANCE.md` 记录 cases3/3、native4/4、forum2193/3、states1/1；这不是 reduced-motion 结果。schema47/48已完成集成不必复做整个部署。交付以菜单2例 + forum导航1例为最小基础；需要对应案例入口时再选案例导航1例，明确未覆盖所有输入排列/物理键盘。

## #217 仅保留的边界与最小后续（本轮不重跑大模型）

- 原生 Clipboard **真实拒绝**：`artifacts/issue-213-217/evidence/presentation-with-clipboard-denied/clipboard-write-interaction.json`；`docs/evidence/issue-213-217/ACCEPTANCE.md` 记录 `NotAllowedError: ... Write permission denied`。观察器 `e2e/visualize/clipboard-write.e2e.ts` 调原生 write 并返回原始 promise，不能改成功或新增 grant。OS readback 例是 `e2e/visualize/lifecycle.e2e.ts:50`，亦未通过。
- **不要用** `e2e.visualize-clipboard.config.ts` / `e2e/visualize/clipboard-provider.ts` 作为绕过：该旧 provider 有 `Browser.grantPermissions`。旧沙箱原始日志 `docs/evidence/issue-193/clipboard-environment-blocked/chromium-stderr.log` 报 `No usable sandbox`；停在浏览器启动前，不意味着已授权页面动作。
- 最小后续是由已有正常浏览器/现有用户身份，在正常用户手势和既有浏览器权限下点一次“复制图像”，记录成功或原始拒绝；拒绝继续保留，不能静默提权。若只能用户本人操作，需求仅为打开卡片并点复制、再在允许的本地目标粘贴确认，不需要交出登录凭据。权限拒绝是环境/用户权限边界，不等于已证明产品错误；反馈是否清楚可独立短测。
- 物理触摸未测：`e2e/visualize/presentation-213-217.e2e.ts` 已有1440/390工具栏 focus、展开/收起和 iframe 控件；窄屏/`.tap()` 不是真实触屏。最小真人需求是一台现有已登录触屏设备：一次打开/收起、点工具栏、点 guest 控件、滚动与继续输入；不要求新增身份或重跑所有生成。
- provider 红例：`artifacts/issue-213-217/evidence/real-provider-results.json`，7个提示6 succeeded + trend partial；`server/src/__integration__/visualize-trigger-live.test.ts` 是 opt-in 原测源。`docs/evidence/issue-213-217/ACCEPTANCE.md` 明确比较案例交叉费用写500元（应约166.67元）、n=20比较标签错误。这是已见生成内容错误，不能归为“仅没有设备”，也不能宣称7/7质量通过。最小后续先静态复核已保存比较HTML/原始数学输入，把内容核验问题单独交给生成质量负责人；不要求再次跑40次模型调用才能发布UI修复。
- 已有真实结果回放 `e2e.visualize-trigger-history.config.ts` 不调用模型，但依赖原专用 DB 与同一 `AGENT_OS_HOMES_ROOT`；路径不同导致403时不得删授权检查或移植其他会话数据。不要拿该配置在任意库上重跑。

## 最终报告口径

每项写清 commit / command / runner及browser版本 / selected, passed, failed, skipped /截图与日志路径。上面 A/B/C 是可并行最小验收工作包，不是通过声明。官网证书/原生沙箱若仍受限，精确报告失败 action、目标和原错误，给“可用正常TLS+沙箱浏览器”这一最小环境需求；无需用户普通技术决策。实际功能红例才修产品，测试接口缺失补小型验收代码；长期观察/真实触屏/真人登录不能无期限扩成整套发布门槛。保持 #217 权限拒绝和 provider 内容红例为明确的未通过/后续路径，不以其他短测代替。
