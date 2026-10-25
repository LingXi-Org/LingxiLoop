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

1. 按 Issue 链接和任务去重标识复用已有云端任务、负责人及 PR；已有实现只补
   集成或发布，已完成且无新增内容时不再派工。只读取最新相关上下文。
2. 缺少必要信息时在原 Issue 集中提问；信息充分时，直接安排到现有 LingxiLoop
   ChatGPT 云端环境，复用环境和依赖缓存。
3. 将邮件中的执行规则实际写入每个云端任务提示词。任务简报包含目标/完成标准、
   负责模块/文件、基线/PR、必要链接、前置依赖、必要检查和交付负责人，
   不复制整段历史、日志或已合并前置的完整差异。
4. 默认显式选择 `gpt-6.1-sol`；可配置时用 `Standard` 速度，简单修改
   `low`、常规开发 `medium`，复杂推理才提高强度，不默认 Fast/Ultrafast/ultra。
   仅 Sol 难以解决且确需统筹时使用 Astra；整个 LingxiLoop 所有同时进行的
   Issue 合计最多一位，复用已有统筹会话。实际设置不可用时如实说明。
5. 一个可交付目标优先由一个任务完成。独立模块可以并行；共享文件或接口契约
   指定唯一负责人，相关需求复用任务，不按 Issue 数机械增加 agent 或递归拆分。
6. 云端只聚焦开发、部署及 MCP 排查具体生产错误；遵守现有发布门槛，执行
   最小必要检查并复用有效结果，不扩展全量测试、重复审查或无关流程。
7. 外部依赖、权限或必要信息阻塞时，记录缺项与恢复条件，暂停受阻部分、继续
   独立工作；不通过频繁轮询、空提交、重跑相同 CI 或重复派工等待。
8. 隔离分支开发。同一生产目标由已有唯一发布集成人收敛候选、确认必要 CI 后
   串行部署，减少中间镜像与发布；无共享发布资源的独立目标可协调并行。
9. 以简短事实回写原 Issue：实际配置、PR/提交、检查、部署回执或阻塞；
   明确区分开发、合并、部署和未验证状态，不能把邮件投递当作开发已启动或完成。

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
