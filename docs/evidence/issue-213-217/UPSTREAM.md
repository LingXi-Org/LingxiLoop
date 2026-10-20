# 可复核的复用与渐进能力边界

核查日期：2026-10-20。产品基线 `b7b165fd704f8d1f22fe8b70b47bfc8d70e02275`，锁定 LingxiOS 3.5.6、migration 46；本 PR 不修改它们。完整读取 #213/#217 及最新评论；#217 的 2026-10-20T02:23:42Z 审查意见与以下边界一致。

| 实际采用 | 版本/许可证 | 原始实现与接入范围 |
| --- | --- | --- |
| [zai-org/ZCode](https://github.com/zai-org/ZCode/tree/0a1fc56d279fd1001f78387bd81aec1c26767411) | `0a1fc56d279fd1001f78387bd81aec1c26767411`，Apache-2.0；查询官方 main 仍为此提交 | 保留原始 GenUiCard、PageAnchor、retainedPage、page plane、Tweak、reference projection、guest runtime、24 文件 visualize skill。归档见 `third_party/zcode`，产品接入见既有 `src/features/chat/visualize/ADAPTATIONS.md`。本次只改产品样式、现有尺寸回调的 Web 布局条件、资源获取调度和目录外提示。 |
| [MCP Apps SDK](https://github.com/modelcontextprotocol/ext-apps) | package-lock 固定 `@modelcontextprotocol/ext-apps@2.0.0`，Apache-2.0 | 继续直接调用官方 App/AppBridge 与原消息传输。未增添任何方法、消息格式、解析器或补丁运行时。 |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui) | package-lock 固定 `@assistant-ui/react@0.15.16`，MIT | 保留 Composer 的官方 mention adapter/formatter 和 ScrollToBottom；产品提供展示名称与样式。未修改 MarkdownText，与 #214 分离。 |

原始来源与许可证的完整哈希由 `npm run verify:visualize` 校验；223 个固定文件、24 个 skill 文件、4 个 runtime entry 与 4 个 vendor/license 对保持不变。本次无 dependency/lockfile/migration 变更，也未复制 LingxiOS 内部实现或提出上游 API 改动。

## 新回复为何仍等完整结果

ZCode 的 `packages/ui/src/gen-ui/domain/references.ts` 在 `!completed` 时只投影 pending；`GenUiMessageResponse.tsx` 只为完成的 ui reference 挂载卡片。其 `packages/desktop/src/renderer/src/plugin-sandbox/genUi.ts` 安装完整 guest document 的官方 App、尺寸观察和状态 API，未接入 HTML token 或通用 HTML patch feed。产品服务端仍要求已投递、完整且绑定 agent/run/path 的 assistant 消息，不能通过删掉这些门槛或重复改写 `srcdoc` 获得所谓流式效果。

SDK 2.0.0 的 `AppBridge.sendToolInputPartial({arguments})` 与 App `toolinputpartial` 提供工具参数预览；它们不是任意 HTML/脚本的增量执行器。现有 ZCode 页面未消费这个通知。将 JSON 参数能力描述为 HTML 流式渲染会误导验收。

检查的替代方案均有真实渐进能力，但使用不同的受限 UI 数据模型：

- [A2UI 官方协议](https://a2ui.org/specification/v0.9-a2ui/) 与 [官方介绍](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/)：声明式组件目录、surface/component/data model 更新；核查 `a2ui-project/a2ui@ba4c47baba5663037217f107d5bcc51f6d35c536` 的官方 direct-json streaming 实现，Apache-2.0。它不能直接承担已保存的任意 ZCode HTML 脚本。
- [json-render 官方 useUIStream](https://github.com/vercel-labs/json-render/blob/72568f990e5502c4d3115691facb8ca928a5c9fc/packages/react/src/hooks.ts)：消费官方 JSONL/JSON Patch spec stream，交给受控组件目录渲染；版本 `72568f990e5502c4d3115691facb8ca928a5c9fc`，Apache-2.0。它同样不是 HTML/token patch 的通用承载器。

因此本次直接复用现有官方 ZCode 完整文档能力：普通正文可继续按既有路径流式显示，完整且已授权的真实可视化随后初始化；历史卡片单独优化资源加载和保留页面的尺寸稳定性。未执行未完成脚本，也未将 spinner、placeholder 或更快的挂载占位算作渐进内容。引入 A2UI/json-render 作为另一个受限组件产品面需要明确的数据模型、组件目录和兼容设计，不能在这个小 PR 内暗换现有历史 HTML 或手写转换协议。

方法参考：[Claude 性能文章](https://claude.dev/blog/how-we-made-claude-ai-faster/) 与 [OpenAI 维护文章](https://developers.openai.com/blog/maintaining-software-with-the-gpt-6-family)。采用相同 fixture/浏览器/资源延迟、分段计时、小范围 diff 与保留失败证据；这些文章不构成实现正确性或生产性能证明。
