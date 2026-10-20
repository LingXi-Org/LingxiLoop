# #214 / #218 / #219 最小浏览器验收脚本

基线：`main@754cd873`。本分支仅补测试与测试 runner；不修改产品组件、私有包、
迁移或部署。范围来自[集成人交接](https://github.com/LingXi-Org/LingxiLoop/blob/7344210abdac1ef2619544d5bb64314ce8b69719/docs/evidence/release-215-216-219/remaining-acceptance-20261020/browser-minimal-handoff.md)。

- #214 保留既有 matchMedia stub 的队列用例，另增一例原生减少动画验收。
  原生例不安装 stub，要求浏览器 JS `matchMedia` 与 CSS `@media` 探针同时为真；
  再断言突发正文完整、无逐帧 reveal、文字/光标动画和颜色过渡停用、结束后光标消失。
- #218 在既有 390/1440 两例中，逐个展开真实 ToolCall 的完成、运行、失败、取消和
  未确认状态，检查 `aria-expanded`、可见详情及对应结果文案，随后收起并截图。
  `research.search` 和 `knowledge.search` 各核对一次；不把合成 fixture 当作真实 provider。
- #219 原生编辑器与论坛配置新增官方 `web({ connect: { cdpEndpoint } })` 的可选入口。
  两个原生菜单例与一个论坛状态导航例在 `E2E_NATIVE_REDUCED_MOTION=1` 时执行同一
  JS/CSS 原生媒体前置探针。论坛 runner 显式透传 CDP 地址、浏览器缓存路径和媒体开关，
  并允许在仓库 `artifacts/` 下指定独立输出目录，避免覆盖旧证据。

## 仅有的本地验证

- `node --check e2e/server/forum.mjs`：通过。
- 用公开 `e2e@0.17.0`、`@e2e-dev/web@0.12.0` 与 TypeScript 5.9.3 在独立
  `/tmp` 工程**复制所选测试文件**做公开接口类型检查：通过。这不是产品依赖的完整
  `test:e2e:typecheck`，也没有启动产品。
- 同一公开 `e2e list` 在三个 fixture 开关开启时选出 **6 个测试，6 个可运行、
  0 个跳过**（#214 一例、#218 两例、#219 三例）；list 不启动浏览器或应用。
- `git diff --check` 和测试 TypeScript 的 esbuild 语法解析：通过。

**产品浏览器实际运行：0/6。** 此工作环境先前严格安装锁定私有包时收到 GitHub
Packages 对 `@lyyzka/lingxios@3.5.6` 的 `E401 Unauthorized`，当前 `node_modules`
不完整；没有新的权限恢复证据，未重试私有安装或借用别的环境路径。
既有官网参考页访问的 `ERR_CERT_AUTHORITY_INVALID` 也未绕过或重试。
这两个环境失败不是本次脚本通过证据。原生安全沙箱可用性亦未在此声明通过。

## 最小复跑命令

在具备**正常正式依赖**的独立产品 checkout 中，先使用已有、未削弱沙箱的浏览器
原生减少动画环境配置 `E2E_CDP_URL`。只设置变量而未改变浏览器原生媒体会使
JS/CSS 前置探针失败。下面 `RUN` 取每次唯一值，端口需先确认空闲。

终端一供 #214/#218 共用：

```sh
export RUN=$(date -u +%Y%m%dT%H%M%SZ)
LINGXILOOP_VITE_CACHE_DIR="$PWD/node_modules/.vite-remaining-ui-$RUN" \
  node node_modules/vite/bin/vite.js --config e2e.final-combination.vite.config.ts \
  --host 127.0.0.1 --port 53119 --strictPort
```

另一终端，在同一 checkout、同一 `RUN` 和已配置的 `E2E_CDP_URL` 下：

```sh
E2E_PROJECT=web E2E_STREAMING_FIXTURE=1 E2E_NATIVE_REDUCED_MOTION=1 \
E2E_BASE_URL=http://127.0.0.1:53119 E2E_CDP_URL="$E2E_CDP_URL" \
node node_modules/e2e/dist/cli/bin.js run e2e/web/streaming-text.e2e.ts \
  --config e2e.config.ts --grep 'native reduced motion shows complete text' \
  --workers 1 --retries 0 --video on --output "artifacts/remaining-214-native-$RUN"

E2E_PROJECT=web E2E_ACTIVITY_FIXTURE=1 E2E_BASE_URL=http://127.0.0.1:53119 \
node node_modules/e2e/dist/cli/bin.js run e2e/web/activity-presentation.e2e.ts \
  --config e2e.config.ts --grep 'known aliases, persisted generic titles' \
  --workers 1 --retries 0 --video on --output "artifacts/remaining-218-cards-$RUN"
```

终端一供 #219 无 DB 的两个菜单例：

```sh
LINGXILOOP_VITE_CACHE_DIR="$PWD/node_modules/.vite-remaining-219-$RUN" \
  node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 53109 --strictPort
```

另一终端：

```sh
E2E_NATIVE_REDUCED_MOTION=1 E2E_CDP_URL="$E2E_CDP_URL" \
node node_modules/e2e/dist/cli/bin.js run --config e2e.native-content.config.ts \
  --grep 'upstream native schema, slash menus|native formatting, links, emoji' \
  --workers 1 --retries 0 --video on --output "artifacts/remaining-219-native-$RUN"
```

论坛状态导航例需先确认指向隔离的本地 PostgreSQL/Redis，再串行运行现有 runner；
它会在 `lingxiloop_forum_test` 上执行迁移并启动本地 API/Vite：

```sh
FORUM_ACCEPTANCE_OUTPUT="artifacts/remaining-219-states-$RUN" \
E2E_NATIVE_REDUCED_MOTION=1 E2E_CDP_URL="$E2E_CDP_URL" \
node e2e/server/forum.mjs --browser-only --states-only
```

官网实时对照仍使用现有官方测试文件，但需正常 TLS 可达的浏览器；本分支没有将
本地源码夹具或证书错误页冒充官网效果。#217 剪贴板权限、物理触屏与真实 provider
生成质量由单独验收线处理。
