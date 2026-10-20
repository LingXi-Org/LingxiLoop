# 官网 StreamingText 浏览器访问失败

2026-10-20 09:35 UTC，独立 `/tmp` 工程安装公开的 `e2e@0.17.0` 和
`@e2e-dev/web@0.12.0`，复制仓库原始
`e2e/web/streaming-text-official.e2e.ts`（SHA-256
`fa90927221f17005e79abebc6f1bb6100fd5cd8abfb5e5141be783794b26558a`），
使用本目录的 `e2e.config.ts`、现有 Chromium 缓存与正常 TLS 设置执行。
这是官网参考页检查，不是产品浏览器回归。

结果：官方引擎成功启动；导航
`https://www.assistant-ui.com/elements/streaming-text` 在第一个步骤返回
`net::ERR_CERT_AUTHORITY_INVALID`，**0/1 通过**。浏览器停在
`chrome-error://chromewebdata/`。未忽略证书错误。

[原始 JSON 报告](report.json) · [JUnit](junit.xml) ·
[失败截图](artifacts/official/streaming-text-official.e2e.ts__official_20Streaming_20text_20live_20reference-a0a95438/default/attempt-0/screenshots/001-failure.png) ·
[视频](artifacts/official/streaming-text-official.e2e.ts__official_20Streaming_20text_20live_20reference-a0a95438/default/attempt-0/video/video.webm) ·
[trace](artifacts/official/streaming-text-official.e2e.ts__official_20Streaming_20text_20live_20reference-a0a95438/default/attempt-0/trace/trace.zip)。
