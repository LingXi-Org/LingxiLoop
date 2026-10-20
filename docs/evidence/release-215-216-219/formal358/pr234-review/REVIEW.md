# PR234 independent documentation review

结论：固定 `6378f0545c00d86e61441b6a7b5929bb5f7d03ca` 未发现 P1/P2，可作为验收边界与失败证据文档合入最终组合。不能据此认定 #214/#217/#218 浏览器验收完成、关闭 issue 或放行生产。

本轮按 repository-review 技能只读审查。使用已有授权 git fetch 获取精确对象，不切分支；未运行浏览器、Provider、npm、包服务、数据库或生产请求，未调整 TLS/权限/沙箱。原 worktree 仍为 `fbd7b02be9acb0314658d53deda23dc8ba338ccd`，无修改；所有新增审查产物仅在本 /tmp 目录。

## 原始结果与叙述一致

- PR 与 c6c47bdd 的 merge-base 正是 c6c47bdd；净 diff 只有 README 及其 official-live-blocked 目录内共10个文档/证据文件，没有产品源码、测试入口、锁文件或部署配置修改。目录内 e2e.config.ts/package.json 是归档的独立公开参考工程配置，不是产品工作流接线。
- report.json：run `01a158aa-b5c8-7c93-b285-972be9835e39`，2026-10-20 09:35:45.580–09:35:47.702 UTC，runner e2e 0.17.0、Node v24.19.0；执行1例，passed0/failed1，run status=error。唯一首步导航错误为 ENGINE_FAILURE / ERR_CERT_AUTHORITY_INVALID。JUnit 对应 tests1、errors1、failures0、skipped0，未被改写成成功。
- screen.txt 的 URL 为 chrome-error://chromewebdata/，1440×960，只有空 document。失败PNG已直接查看：空白。1.44秒视频实际解码36帧，所有灰度像素均255（白色）；trace的3个screencast帧字节相同。它们证明一次真实浏览器导航失败，不提供官网效果对比。README 和 PR body 明确说明0/1、不是产品回归，与原始结果一致。
- 四个原始附件（screen/PNG/WebM/trace）的实际字节数和SHA256全部匹配 report.json。原始 video 的 redaction=incomplete 与 trace 的 not-required 标签没有擅自改写；本审查另行检查其实际内容，未把标签本身当成隐私保证。

## trace 与公开数据边界

trace.network 只有一次 GET `https://www.assistant-ui.com/elements/streaming-text`，无查询参数、request/response Cookie、Authorization/Proxy-Authorization。request headers仅语言、浏览器标识和导航相关项；响应无headers/body。trace context未设置 ignoreHTTPSErrors、httpCredentials 或 storageState；配置也未添加证书或沙箱绕过参数。

trace所有文本资源与10个提交文件内的可读文档检查未发现 GitHub credential、Bearer值、私钥、带认证URL、密码/API key赋值或生产站点请求。实际API操作只含公开页goto、失败后的DOM观察/截图/停止录像；没有填充表单、产品会话、模型提示、用户内容或业务写操作。trace包含 `/tmp/lingxi-official-e2e` 及包内部调用栈路径，属于工具诊断路径，无凭据。本轮没有复制或读取任何凭据文件。

## 源码与历史证据声明复核

- `ac906946..c6c47bdd` 实际只改两份 App compose 的镜像 pin，与README一致；这证明源码差异，不独立证明当前线上部署状态（本轮无生产访问）。
- `c6c47bdd..3e49d9d48d9ea5df4bd8d07a2c758f5e8716cb50`：README列举的 StreamingText、markdown-streaming、chat.css、整个 chat/visualize、runActivity、官方 RunActivity/MemoryChips 路径都存在且无diff。#218相关 MemoryTool、NativeMessageContent、RunActivityHistory 确实有变化，README要求最终组合重验是准确的。候选四份package/lock均仍为3.5.6，不是正式3.5.8/schema13资格证明。
- 原始 StreamingText SHA256 `d7aec7e7ba1977105095ff2554d266e040a707eb60709535ae194a72db30592d`、产品适配 `e5c0fb26653ef03fa709b55ad87ffd2f8ff3b3df74ccabcbf34b32bf567174c2`、RunActivity `1b838ae6054c2c45535701af231291436e77da1d6215a2c2a80a313de5aaeace` 全部匹配。StreamingText/source/range/LICENSE三项manifest hash匹配；ZCode manifest223个固定文件的字节数/hash匹配。这里只做静态hash，不重跑作者脚本或产品测试。
- runActivity已知action literal keys与type-map各97项，集合相同且无重复；README明确普通ToolCall仍是大量动作的展示边界，没有把97行文案覆盖写成97个专用组件。
- #217引用的历史summary中全部中位数与各自三个样本重算一致；三卡cold首内容2184.2→1910.4ms、全卡2300.4→1941.7ms，单卡首内容1251.4→1199.2ms，与README四舍五入值一致。它明确是旧短测，不是新环境/provider/p95证明；原生剪贴板拒绝、真实触屏未验、任意HTML不支持流式、provider趋势partial及内容质量错误均仍保留。

## 未验项与非阻塞证据限制

1. 包 E401 / 产品 Vite 缺依赖的原始日志不在这10个新增文件内。本轮仅核对其被保留为作者报告的失败，未访问 package、未换认证身份/工具、未修权限，也没有把它当成已通过。后续 root 使用本会话原有合法环境的独立 UI 验证应记录新来源、新提交和新结果，不覆盖这次失败。
2. 原公开参考测试的仓库SHA256确为 `fa90927221f17005e79abebc6f1bb6100fd5cd8abfb5e5141be783794b26558a`；trace/report中的文件名与来源位置一致。执行时 `/tmp/lingxi-official-e2e` 已不在当前文件系统，因此不能独立重新hash当时的临时副本或安装树。README宣称副本逐字相同是作者当时记录，不冒充本轮重新证明；本次只是0/1失败归档，不影响文档可合入结论。
3. 当前依旧没有新的成功产品浏览器结果。官网TLS失败、native reduced-motion OS模拟限制、剪贴板拒绝、触屏与provider质量边界继续未通过/未覆盖。正式3.5.8锁版后的组合 owning UI/HTTP/CI/OCI 等另行验收，本PR不替代。

交付：`source-proof.json` SHA256 `7d736091cfd561224455d80cbd17880adeba9a2f1353394f2c5bfa66b84fcbef`，包含10文件精确hash、4附件校验、trace白名单计数、源码diff/锁版声明、223/3文件hash和97映射检查。无本轮审批拒绝或不确定写操作；所有受限动作均未尝试。
