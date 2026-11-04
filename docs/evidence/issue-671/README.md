# 案例编辑与预览验收 — 2026-11-04

关联 #671。参考用户提供的「明理 · 对话页重设计 (5).html」第3、4页。正文继续使用现有 ContentEditor；其余采用原稿的680px内容区、300px设置栏、六色文字点阵封面、标题/摘要字号和预览检查区。

截图均为本地合成数据。浏览器验收包括首页教师新增入口与分类加号、分类创建后可选、学院创建并在刷新后保留、文字/配色实时预览、保存草稿、编辑↔预览、去填写简介的焦点、发布成功、发布失败保留输入及学生不显示新增入口。覆盖1440×900、390×844；窄屏裁切问题已修复。可复现脚本：`scripts/fixtures/cases-editor-check.mjs`，以浏览器工具传入 tab 和 viewport 后调用 `checkCaseEditor`；运行 `node scripts/fixtures/cases-preview.mjs` 可启动相同fixture（默认5205，传base参数；本次5210）。

## 实跑验证

- web `typecheck`、server `typecheck`、案例文件 scoped Biome lint。
- 案例展示/封面/契约8项；deploy runtime patch22项。
- 专用本地 PostgreSQL 17 + Redis：正式3.8.24，从61增量到62、第二次no-op；迁移失败回滚、错误provenance拒绝、历史公开分类回填且草稿不泄漏/正文不变。
- cases集成3项通过，覆盖选项持久化/去重/组织隔离/学生权限/HTTP输入、发布快照、旧客户端兼容、409冲突、不再创建旧封面任务。
- runtime-patch61-24-provenance15项通过，保留21/22/23到24的原迁移边界。

## 已知验证限制与退场边界

Windows的production-rag合同运行54/55通过，嵌套retain-editor-assets的bash测试因ctr stub路径不兼容失败；CI scope现有共享路径测试也受Windows分隔符影响。Linux CI负责补齐这些环境检查。首次本地bootstrap因Windows npm启动失败，使用仅本地临时npm启动适配后成功，不改生产流程。

未进行生产真实账号的内容写入。视觉经过原HTML和截图人工对照，不宣称自动零像素差异。原封面模型/worker/API/轮询/VM全部退出，旧历史表与对象数据保留；已打开旧页面需刷新。62之后只能部署兼容62的修复，不能回到拒绝62 ledger的旧61版本。
