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

## 邮件配置

复用仓库现有 `production` 环境。优先读取 Actions Secret `RESEND_API_KEY` 和
Variable/Secret `EMAIL_DOMAIN`，发件地址为该已验证域名下的 `no-reply@域名`。
未配置直接凭据时，沿用仓库 `scripts/run-capability-acceptance.mjs` 的 Komodo 读取方式，
使用现有 `KOMODO_WEBHOOK_URL`、`KOMODO_API_KEY`、`KOMODO_API_SECRET`，只读取
`RESEND_API_KEY`、`EMAIL_DOMAIN` 两个变量。

Komodo 地址只允许既有 HTTPS 主机 `ops.christmas1314.xyz`。密钥仅用于进程内请求，
不写入仓库、文件或普通日志。邮件发往固定收件地址，不允许 Issue 内容改变收件人。
使用 Python 标准库，无需安装产品依赖。

修改工作流或发送脚本并合入 `main` 时自动执行 `probe`；该步骤检查配置，
不发送开发邮件。Actions 页面也可手动运行 `probe`。配置缺失或服务拒绝发送时，
工作流报错，不留下“已发送”回执。

## 发送回执与重试

同一 Issue 的运行串行执行，不同 Issue 可以并行。发送成功后由 `github-actions[bot]`
留下带 `<!-- lingxiloop-dot-email:v1:sent -->` 标记的回执，用户复制的同名标记不会被采信。
Resend 请求另带由仓库和 Issue 永久 ID 生成的 `Idempotency-Key`。

回执表示邮件服务接受请求，实际收件应由邮箱确认。Resend 的幂等窗口为 24 小时；
如果服务接受请求后运行中断、回执未写入，重试仍应查看具体运行状态，不能把这套流程
描述为永久、严格的 exactly-once 投递。

停止此流程可禁用 Actions 中的 `Issue to ChatGPT Dot email` 工作流。
撤销代码只需回退本次工作流、脚本和本文，不涉及产品数据或生产镜像。

参考：[GitHub Issue 事件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#issues)、
[GitHub 评论事件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#issue_comment)、
[Resend 发送接口](https://resend.com/docs/api-reference/emails/send-email)、
[Resend 幂等键](https://resend.com/docs/dashboard/emails/idempotency-keys)。
