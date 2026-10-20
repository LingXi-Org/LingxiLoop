# #214 / #217 / #218 基础验收复核（2026-10-20）

本记录核对 `main@c6c47bddeabb4488f9fe93391f15c695a528260c`、已上线源码
`ac9069460e99a20fac7f2c3de87c60f2bec66924`，以及集成人提供的产品候选
`3e49d9d48d9ea5df4bd8d07a2c758f5e8716cb50`。它是独立、只读的源码与既有证据复核；
本次没有取得新的成功浏览器运行，不应据此关闭 issue 或通过发布验收。

## 提交差异和源码边界

`ac906946..c6c47bdd` 仅修改两份 Komodo 应用 compose 中的镜像 pin，没有三项功能源码变化。
`c6c47bdd..3e49d9d` 在以下 #214 / #217 产品实现路径没有 diff：
`src/components/assistant-ui/elements/streaming-text.tsx`、
`src/components/assistant-ui/markdown-streaming.tsx`、`src/styles/chat.css`、
`src/features/chat/visualize/` 和 `src/lib/runActivity.ts`；官方 `run-activity.tsx`
及 `memory-chips.tsx` 组件也没有 diff。候选对 #218 相关的
`MemoryTool.tsx`、`NativeMessageContent.tsx`、`RunActivityHistory.tsx`
有变更，必须在最终组合上重新验收。该候选根目录和 server 均仍锁定
`@lyyzka/lingxios@3.5.6`，尚非所述 3.5.8/schema13 发布组合；产品 migration
已到 0048。不能用此提交的检查结果代替最终正式包、锁文件、镜像和迁移验收。

| Issue | 当前可核实事实 | 尚未通过的验收边界 |
| --- | --- | --- |
| #214 | 直接保留 assistant-ui `736c07f5` 的原始 StreamingText 与 MIT 许可；产品组件复用新增文字入场、700ms 颜色过渡、尾部两词窗口和 `w-0.5` 光标，Markdown/CJK 做无损分段。原始源码 SHA-256 `d7aec7e7ba19…`; 当前产品适配 SHA-256 `e5c0fb26653e…`。既有官方引擎产物包含同输入的**本地原始源码/产品**截图、中文突发、完成、取消、失败和历史场景。 | 既有浏览器访问官网因 `ERR_CERT_AUTHORITY_INVALID` 失败，原始源码夹具不能冒充官网现场。原生 OS 减少动态效果浏览器模拟曾遇到 `No usable sandbox`；现有 matchMedia 测试只覆盖队列行为。此次未能重新执行短测。 |
| #217 | 固定 ZCode `0a1fc56d` / MCP Apps SDK 2.0.0 仍承载完整已授权文档。工具栏源码为 `right-1 top-1`，既有 390/1440 截图与浏览器坐标断言在右上角。既有同条件历史短测：三卡冷进入首个有效内容中位数 2184→1910ms，全部就绪 2300→1942ms；单卡冷进入仅 1251→1199ms。 | 任意 HTML 的安全增量执行不在当前 ZCode/MCP SDK 能力内，新回复在完整已授权引用后挂载；不能把占位或 SDK 工具参数预览报为内容流式。原生剪贴板写入被浏览器拒绝；真实触屏未测。真实 provider 趋势例 `partial`，比较/趋势内容有数值或标签错误，不能以工具调用/渲染成功代替内容质量。此次未能重新执行浏览器短测。 |
| #218 | `RunActivity` 容器当前 SHA-256 `1b838ae6054c…` 与所记录官方源码完全一致；脚本核对 `runActivity.ts` 的 97 个已知动作（79 产品 + 18 runtime）与 `type-map.md` 97 行一一对应。普通授权记忆卡片由真实 `QueryClientProvider` 与服务端查询承载，既有 fixture 截图覆盖记忆内容、空、加载、错误/重试。 | 类型文案覆盖不等于每个动作有专用官方展示；当前矩阵明确大量动作使用官方通用 ToolCall，这是上游组件/公开载荷边界。候选记忆变更改为每 15 秒、挂载、聚焦时重查，并在无当前控制权的只读视图中不回退旧 receipt；要在最终包上核对历史、撤权和多 run 遗忘。既有官网卡片浏览器比较同样遇到证书错误；此次未能重新执行短测。 |

## 既有可复核证据

- [#214 源码来源、适配和原始浏览器记录](../issue-214/README.md)，以及
  [同输入原始源码/产品截图](../issue-214/product/001-official-source-product-same-input.png)、
  [中文流式截图](../issue-214/product/001-streaming-burst-light.png)。这些是旧运行产物，
  不属于本次新运行，也不是官网网页截图。
- [#217 原始性能数据、失败项与复跑命令](../issue-213-217/ACCEPTANCE.md)，
  [窄屏工具栏截图](../../../artifacts/issue-213-217/evidence/screenshots/visualize-after-toolbar-focus-390.png)，
  [开源渐进能力边界](../issue-213-217/UPSTREAM.md)。
- [#218 97 项组件映射](../issue-215-218/type-map.md)、
  [官方源码差异审查](../issue-215-218/source-review.md)、
  [记忆截图](../issue-215-218/browser/after-memory-context.png)、
  [卡片截图](../issue-215-218/browser/after-official-cards-390.png)，以及
  [最终候选的记忆浏览器摘要](https://github.com/LingXi-Org/LingxiLoop/blob/3e49d9d48d9ea5df4bd8d07a2c758f5e8716cb50/docs/evidence/issue-216/browser-summary.md)。

## 本次短测阻断

先在当前 `main` 以仓库官方 `e2e/web/run.mjs` 与 `@e2e-dev/web` 选取
流式、活动和记忆用例。测试应用的 Vite 构建在启动前因缺失
`@modelcontextprotocol/ext-apps/app-bridge` 失败，**0 个浏览器用例执行**。
随后尝试严格按锁文件 `npm ci --ignore-scripts` 恢复依赖。原缓存出现大量
tarball 校验重试；换用全新 `/tmp` 缓存后，GitHub Packages 对锁定的
`@lyyzka/lingxios@3.5.6` 返回 `E401 Unauthorized`。未关闭 TLS、完整性、
权限或浏览器沙箱检查；未使用私有包替代品。因此本次无法生成新的实际浏览器
截图、计时或成功测试报告。需要对锁定私有包具有正常读取权限的执行环境，
并在正式 3.5.8 包和最终组合提交确定后，重新运行三个 issue 的针对性官方浏览器用例。

此分支未修改产品、测试、部署配置、依赖锁文件或任何 issue 状态。
