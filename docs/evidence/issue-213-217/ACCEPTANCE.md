# #213 / #217：实现与验收记录

Draft PR [#222](https://github.com/LingXi-Org/LingxiLoop/pull/222)。基线是 `b7b165fd704f8d1f22fe8b70b47bfc8d70e02275`，生产镜像钉住 `2ea8615c`；不是把旧的本地 `work` 分支当成 main。产品实现检查点 `5f4ea48d8fe0a2bd69aac87d81d3060195870d6f`。本分支不合并、不部署、不关闭 issue；最终集成与发布由 `01a1545a-ea6d-7522-a38d-4c6f33afd0d5` 负责。

## 改动与兼容边界

- 两种滚动到底部按钮均由 `z-10` 提到 `z-30`，高于 `z-20` 的输入框模糊层；四层原渐进 blur 保留。普通滚动与阅读历史分支都验证 Enter/Space 回到最新消息。
- 共享 MentionBadge 改为 `align-middle`。基于 `kind=agent` 与稳定 `presetKey`，仅将未改名内置角色的 Nova/Sage/Milo/Trace/Scout/Forge 显示为司南/明理/砺思/溯源/寻知/成器。正文、候选、已选 chip、title、aria-label 和刷新后的历史均覆盖。
- 历史英文 handle 通过已有 scanner 的 alias 列表解析；稳定 ID 寻址、Markdown 代码/链接/邮箱屏蔽与歧义去除保留。自定义 “Nova Labs” 和已改名 preset “我的研究搭档” 不被覆盖。缺少身份的未知 fallback 保留原标签，不凭英文文本猜测成员身份。没有数据迁移或历史删除。
- GenUiCard 灰底使用现有 `rounded-xl` 和 `overflow:clip`，右上工具栏内缩 4px，保留 hover/focus/触屏 CSS；expanded toolbar 没有迁移。使用 clip 避免 hidden 创建额外滚动容器。
- 资源链的四个匹配 vendor 下载并行，替换及脚本执行次序不变。没有新增全局缓存、跨 scope 复用、宽松 CSP 或绕过页面授权。
- 回归捕获到停放的 iframe 仍通知 `height=10`、`width=366`，覆盖先前 446px 高度并使重进内容无法点击。尺寸回调现在检查 Web plane 是否参与 DOM 布局；屏外但参与布局的页面仍可更新。快速切换前后证据保留了相同六条真实隐藏尺寸通知，修复后仍是 `[446,446,446]`。没有自创消息或修改官方 guest runtime。

未修改 MarkdownText、RunActivity、画布、runtime/锁文件、迁移或内置 preset 数据。官方复用版本、许可证与不能宣称流式的原因见 [UPSTREAM.md](UPSTREAM.md)。

## 历史性能：同条件短测

官方 `tester-army/e2e@0.17.0` + `@e2e-dev/web@0.12.0`，同一 Chromium、1440×960、DPR 1、相同完整历史 HTML、1/3 卡、每场景 3 次。固定资源接口使用与产品相同的 no-store，并统一增加 80ms 响应延迟；浏览器前后串行运行，无同时构建或其他浏览器套件。两轮均有真实模型 worker 在后台运行。不是生产网络或用户 p95 测量。

页面内观察原 SDK 的非空内容尺寸、已初始化状态及实际 frame 布局，再等待两个 animation frame 记录内容绘制；多卡就绪要求每张可见卡片满足条件。加载占位不计入。随后真实点击 guest 控件并断言状态改变，记录的 `interactiveMs` 包含官方引擎跨 frame 观察及断言开销，不能当作纯页面初始化耗时。

| 卡数 / 场景 | 首个有效内容中位数，前→后 (ms) | 全部卡片就绪中位数，前→后 (ms) |
| --- | ---: | ---: |
| 1 / 首次冷进入 | 1251 → 1199 | 1251 → 1199 |
| 1 / 切换到新对话 | 974 → 702 | 974 → 702 |
| 1 / 返回已保留对话 | 28 → 31 | 28 → 31 |
| 1 / 退出再进入 | 33 → 25 | 33 → 25 |
| 3 / 首次冷进入 | 2184 → 1910 | 2300 → 1942 |
| 3 / 切换到新对话 | 1996 → 1542 | 2019 → 1624 |
| 3 / 返回已保留对话 | 31 → 31 | 44 → 31 |
| 3 / 退出再进入 | 30 → 24 | 30 → 24 |

前后各 6 测试、24 场景均通过真实交互断言。返回/退出再进入均为零新增 vendor 请求，且各对话交互状态分别保留。代表性冷加载的 vendor 获取区间从单卡 361→99ms、三卡 511→265ms；请求 start/duration/bytes 在每次原始 JSON 中，可核对串行瀑布消失。

三卡冷加载内容出现约改善 12.6%，全部就绪约改善 15.6%；单卡冷加载中位数只改善约 4.2%，且候选单卡第三次出现 2118ms 离群值。驱动观测的单卡冷进入完成点击中位数 3624→3738ms，没有稳定改善。保留这些结果，不将所有场景概括为全面提速。三个样本不足以推断长期尾延迟。

[完整样本与中位数](../../../artifacts/issue-213-217/evidence/performance/summary.json)、[before 原始记录](../../../artifacts/issue-213-217/evidence/performance/before)、[after 原始记录](../../../artifacts/issue-213-217/evidence/performance/after)。初期一轮 80ms 环境未传入子进程，另有并发构建污染的探索轮次，均不用于此表；最终取上述明示条件的两轮。两次真实重进失败未丢弃，修复及 [隐藏尺寸前](../../../artifacts/issue-213-217/evidence/retention/hidden-size-before.json)/[后](../../../artifacts/issue-213-217/evidence/retention/hidden-size-after.json) 单独留证。

## 功能、真实 provider 与未通过项

| 检查 | 实际结果 |
| --- | --- |
| Web lint / typecheck / 65 tests / build | 通过；lint 既有 5 warnings、2 infos，构建保留既有 CSS/chunk 提示 |
| Server lint / typecheck / 117 tests（含现有 mentions 用例） | 通过 |
| Visualize / runtime / teacher 授权集成 | 独立本地 PostgreSQL/Redis，11 passed、0 skipped；不宣称真实模型测试 |
| immutable source verifier / runtime build | 223 固定文件、24 skill、4 runtime entry、4 vendor/license 对通过，无 upstream 归档改写 |
| E2E TypeScript | 通过 |
| 中文提及与两种滚动按钮 | 桌面 1440 与窄屏 390，加候选/选中/中文 roster 刷新，3/3 通过 |
| 工具栏/圆角/错误重试/加载/展开收起与输入 | 3/3 通过；桌面与 390px 键盘聚焦时 toolbar opacity=1，坐标距右上各 4px，圆角 12px，页面无横向溢出；真实卡片仍处 loading 时可继续输入并读取正文 |
| 既有 lifecycle / bridge 短回归 | 6/6 通过：variant 本地状态、D3/日历、各会话状态与主题、显式重试、离线恢复、可信手势/过期页面/作用域释放；独立保留剪贴板失败，不把选测结果描述为整个套件全绿 |
| retained 页面快速来回切换 | 1/1 通过，包括 12 次常规切换及额外 12 组快速 B/A 切换 |
| 真实模型已完成内容回放 | 1/1 通过：真实保存的 HTML，经产品历史、完整引用授权、资源接口和官方 sandbox 渲染；桌面展开/收起及 390px 截图齐全 |
| 原生 Clipboard 写入 | **未通过**：浏览器返回 `NotAllowedError: ... Write permission denied`。未授权额外权限，未改写结果，未重试绕过；OS 剪贴板读回也未验证。保留 [原始结果](../../../artifacts/issue-213-217/evidence/presentation-with-clipboard-denied/clipboard-write-interaction.json)。 |
| 真实触屏设备 | 未覆盖。窄屏与原触屏 CSS 规则已检查，但没有以鼠标模拟器声称通过真实触屏验收。 |
| 任意 HTML 渐进/流式渲染 | **未实现且未声称支持**；见上游能力边界。 |

真实 provider 为 SiliconFlow `zai-org/GLM-5.3-Flash`，通过现有安全启动器注入密钥，未打印/复制密钥；使用生产公开 runtime 和工具。测试仅把 IM HTTP 投递和对象存储作为明确 fixture，provider 没有 mock。7 个固定提示不包含“画图/可视化”等触发词。比较、结构关系、流程、趋势、可调输入均生成 1 个完整引用并投递；事实与问候无 visualize 工具。共 40 次实测模型调用，费用合计 0.06157144 USD，见 [每案 ledger 汇总](../../../artifacts/issue-213-217/evidence/real-provider-results.json)。

严格测试仍失败 1 项：趋势运行状态为 `partial`，公开 runtime 结果记录数值分析未满足核验，因此不是 7/7 全通过。首次试跑使用过紧的 200k token 预算，并且旧 IM subclass fixture 没有覆盖带 AbortSignal 的 client；发现后改用仓库已有 HTTP recording fixture 与默认 1M token 预算，保留 20-call/180s/0.25 USD 上限重测，没有削弱产品授权或删除断言。最终 6 个 succeeded、1 个 partial，五类都完成引用并不代表内容质量全部合格。探索轮另外使用 25 次实测调用、0.03427802 USD；两轮合计 0.09584946 USD。

真实截图也揭示模型内容错误：比较案例把交叉点费用写成约 500 元（应约 166.67 元），并在 n=20 时给出错误比较标签。图形可加载/操作不等于答案正确；不修改真实输出来制造正确截图。这是仍需集成人审视的生成质量限制，不能宣称端到端质量验收完成。

真实历史回放第一次被路径校验 403 拒绝：回放进程遗漏生成时的 `AGENT_OS_HOMES_ROOT`。只在核对已保存路径属于同一独立测试目录后，恢复同一配置并重验一次，检查原样保留；最终通过。此项不是修改授权或把其他会话文件放行。

## 复跑与截图

所有浏览器均使用官方引擎，没有直接导入/调用 Playwright。先按仓库安装依赖、生成固定 visualize runtime，并设置当前环境可写的浏览器安装目录：

```sh
npm ci --ignore-scripts
npm run build:visualize-runtime
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/e2e-browsers npm run test:e2e:install
export PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/e2e-browsers E2E_TELEMETRY_DISABLED=1
E2E_VISUALIZE_RESOURCE_DELAY=80 npx e2e run --config e2e.visualize-loading.config.ts
npx e2e run --config e2e.visualize-retention-213-217.config.ts
npx e2e run --config e2e.chat-213.config.ts
E2E_VISUALIZE_RESOURCE_DELAY=1200 npx e2e run --config e2e.visualize-213-217.config.ts e2e/visualize/presentation-213-217.e2e.ts
```

基线在独立 detached worktree `b7b165fd` 跑同一 fixture/test 文件；`E2E_CAPTURE_BASELINE=1` 只用于截图和记录旧坐标，不把旧行为算作新验收通过。性能前后不能同时运行其他浏览器或构建。

真实 provider 用例为 `server/src/__integration__/visualize-trigger-live.test.ts`，仅 `LINGXIOS_LIVE_VISUALIZE_TRIGGER=1` 启用。必须指向本地专用 `lingxiloop_issue213217_test` 数据库（测试会重置该测试库），先由正常迁移命令应用全部 46 迁移；配置测试 Redis、32 字符以上测试 service token 和现有测试 provider 启动器。使用 `AGENT_OS_MAX_CONCURRENT_RUNS=1`、`AGENT_OS_MAX_MODEL_CALLS=20`、`AGENT_OS_MAX_MODEL_TOKENS=1000000`、`AGENT_OS_MAX_MODEL_COST_MICROS=250000`、`AGENT_OS_MAX_WORK_MS=180000`。不把默认 opt-in skip 算作通过。

在上述同一测试库及同一 `AGENT_OS_HOMES_ROOT` 下，`e2e.visualize-trigger-history.config.ts` 可重复回放已经真实生成并已投递的比较案例；不存在有效完成结果会明确失败，不回退 canned HTML。该回放不调用模型。

截图集中于 [evidence/screenshots](../../../artifacts/issue-213-217/evidence/screenshots)，包括前后提及、两分支按钮、桌面/窄屏工具栏、加载状态以及真实 provider 原始内容。JSON、JUnit、命令日志和 SHA-256 清单与截图一同交付。未上传任何生产用户数据。

最终合并前仍需独立审查以及最终候选 CI；本分支的成功检查不替代指定集成人的发布 gate，也不改变上面的失败/未覆盖项。
