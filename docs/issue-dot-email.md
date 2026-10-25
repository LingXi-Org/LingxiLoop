# Issue 邮件交接给 ChatGPT Dot

工作流：`.github/workflows/issue-dot-email.yml`。收件地址固定为
`yangyangli0426@gmail.com`，邮件主题为 `[LingxiLoop Dot] #编号 标题`。

## 日常使用

| 情况 | 行为 |
| --- | --- |
| `leecyang` 或 `lyyzka` 新建 Issue | 自动发送开发请求邮件 |
| 其他账号新建 Issue | 留下待审核评论，暂不发送邮件 |
| `leecyang` 或 `lyyzka` 评论 `/dot approve` | 审核通过并发送邮件；任意一人即可 |
| 其他账号评论相同指令 | 不授权、不发送 |
| 已发送的 Issue 再次审核或重新打开 | 识别发送回执，不重复发送 |
| 发送失败后上述两人评论 `/dot retry` | 在原有授权仍有效时重试；不绕过审核 |

指令需要独占整条评论，不附带其他文字。判断以 GitHub 记录的真实账号为准，
不信任 Issue 正文中的署名、标签或“代某人提交”等声明。PR 评论不进入此流程。

历史未发送的 Issue 可由上述两人评论 `/dot approve`，也可在 Actions 页面手动运行
`dispatch` 并填写 Issue 编号；手动运行仍要求作者可信或已有真实审核评论。
已关闭的 Issue 不发送开发任务。

## 邮件里的工作要求

邮件包含原 Issue 链接、描述、讨论上下文、真实作者或审核人及 Actions 运行链接。
要求 ChatGPT Dot `yangyang`：

1. 先读取最新 Issue、相关代码和正在进行的工作，避免重复开发。
2. 缺少必要信息时在原 Issue 下沟通补齐；信息充分时自行安排到当前已有的
   LingxiLoop ChatGPT 云端环境开发。
3. 默认使用 `6.1sol`，独立工作可并行开发、部署；只有确需协调时使用至多一个
   `Astra`。同一生产目标的发布需要协调，避免相互覆盖。
4. 云端环境负责开发、部署，或使用 MCP 排查具体生产错误；只做必要的构建与上线
   检查，不扩展为全量测试、无关审查或其他流程。
5. 回写实际开发和部署结果；环境、模型或权限不可用时如实说明，不能把已发邮件
   当作已启动云端开发或部署完成。

GitHub Action 负责审核和邮件投递。邮件是给 Dot 的任务交接，不能直接设置
ChatGPT 内的模型、创建云端编程会话或证明 Dot 已开始执行。

## 邮件配置与身份验证

复用现有 Cloudflare control-plane Worker 的阿里企业邮箱 SMTP：
发件地址 `no-reply@lingxilearn.cn`，服务器 `smtp.qiye.aliyun.com:465`。
邮箱密码继续只由现有 Worker Secret `ALIYUN_OTP_EMAIL_PASSWORD` 保管。

Action 通过 GitHub OIDC 获取短期身份令牌，调用固定入口
`https://admin.lingxilearn.cn/api/internal/issue-dot-email`。
Worker 验证 GitHub 公钥签名、令牌期限、受众、仓库和组织永久 ID、
`main` 分支、指定工作流文件及 `production` 环境后才处理。
其他仓库、PR 分支和未经授权的请求不能使用该入口；收发地址均固定。

Action 只需要 `contents: read`、`issues: write`、`id-token: write`，
不需要新增 SMTP/Resend/Komodo 密钥，也不安装产品依赖。
Worker 复用现有发送实现，只新增一个受限入口，无新增依赖或数据表。

Actions 页面可手动运行 `probe`，验证工作流身份和 SMTP 配置存在，不发送邮件。
实际 SMTP 认证和收件结果由一次真实发送确认。配置缺失或服务拒绝发送时，
工作流报错，不留下“已发送”回执。

## 发送回执与重试

同一 Issue 的运行串行执行，不同 Issue 可以并行。发送前由 `github-actions[bot]`
记录 `<!-- lingxiloop-dot-email:v1:pending -->`；SMTP 确认接受后将同一条评论更新为
`<!-- lingxiloop-dot-email:v1:sent -->`。用户复制的同名标记不会被采信。

回执表示 SMTP 接受邮件，实际收件应由邮箱确认。SMTP 不提供跨系统事务：
如果传输中断导致结果不确定，pending 标记会阻止自动重发，避免重复创建开发任务。
维护者先核对 Gmail/SMTP 记录，确认未发送后删除 pending 评论，再评论 `/dot retry`。
身份/参数/配置等发送前拒绝会清除 pending 标记，修复后可直接重试。
同一 Issue 的已发送回执存在时，重新审核、重新打开或重跑均不再次发信。

停止此流程可禁用 Actions 中的 `Issue to ChatGPT Dot email` 工作流。
若需撤销 SMTP 入口，回退对应 Worker 版本及本次新增路由/文件；不涉及产品数据。

参考：[GitHub Issue 事件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#issues)、
[GitHub 评论事件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#issue_comment)、
[GitHub OIDC](https://docs.github.com/en/actions/reference/security/oidc)。
