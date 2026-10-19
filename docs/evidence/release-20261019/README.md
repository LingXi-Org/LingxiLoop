# 2026-10-19 预发布验收证据

`@lyyzka/lingxios@3.5.3` 已正式发布，registry gitHead 为 `59be37b141f41798ec03b2fffabb824d3ef50e36`。[runtime CI](https://github.com/LingXi-Org/LingxiOS/actions/runs/39240936281) · [发布流程](https://github.com/LingXi-Org/LingxiOS/actions/runs/39241356024)。精确包 integrity：

```text
sha512-e/KhQgtBJlKQl1aM+amJGail2ax8rqGL4Bqw68ehIM+2mlUbaq0WT1FD8WQaGU1/t7TyhYk8gt2IuHlX6OKhfQ==
```

产品 PR #185、#188、#192、#191、#190、#189 已合并，最终 main 为 `b76c4cc00f545ddbca27bced6628e1ed191e6777`。本预发布证据快照创建时，[最终 main CI 39243667498](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39243667498) 仍在运行，本包不宣称它已通过。生产部署尚未发生；后续发布结果以发布 PR 的最终回执为准。

| 验收 | 实际结果 | 证据 |
| --- | --- | --- |
| 问卷与相关消息、迁移 | 66/66（36 + 30）；server 107/107；web 92/92；browser 8/8，均零跳过 | [validation](questionnaire/validation.json)、[browser report](questionnaire/browser/report.json)、[JUnit](questionnaire/browser/junit.xml) |
| 案例相关集成与合成 live fixture | 52/52、1/1，零跳过 | [summary](cases/summary.json)、[实际 runtime](cases/actual-runtime.json)、[依赖一致性](cases/physical-dependencies.json) |
| 案例浏览器 | 2/2，零跳过 | [report](cases/results/cases/browser/report.json)、[JUnit](cases/results/cases/browser/junit.xml) |
| 论坛 #184 / #187 | browser 3/3 + 1/1；论坛集成 10/10，零跳过 | [#184 report](cases/results/forum184/browser/report.json)、[#187 report](cases/results/forum187/browser/report.json)、[summary](cases/summary.json) |
| Provider 矩阵首轮 | 13/14；1 失败，0 跳过 | [首轮摘要](provider-acceptance/20261019T110518Z/matrix-summary.json) |
| Deadline 单项独立复验 | 1/1；未改变阈值，未重跑全矩阵，付费调用 0 | [单项摘要](provider-acceptance/20261019T111735Z-deadline-targeted/matrix-summary.json) |
| 真实模型验收 | 1/1；4 次成功调用（Agent 3、host helper 1） | [live summary](provider-acceptance/20261019T110518Z/live-summary.json)、[完整公开说明](provider-acceptance/20261019T110518Z/PUBLIC-SUMMARY.md) |
| PR 级 CI 集成结果 | PR190：269 pass / 21 门控 skip；PR189：281 pass / 21 门控 skip | [release state](release-state.json)，由发布主会话报告；不等同最终 main CI |

上述专项不是在最终 main 上新增重跑：问卷源提交为 `05b6fd2ed9ee53ed5c1fb07e29ba7dc730899878`，案例与 provider 源提交为 `ef594b8b8f0091d49ac4d618d2c221bdc54f617a`。各文件保留精确提交与包完整性，不能把分支验收改称最终 main 验收。

Provider 首轮的 100ms deadline 用例观察到请求数 0，而预期为 1。单项复验后来通过；首轮仍记为 13/14，不能合并写成 14/14。真实模型总 usage × 测试 tariff 为 **USD 0.00405601**，不是供应商扣费收据。Agent root 的预算不覆盖 host helper；总额限制是运行后的账本断言。[最终 provider 汇总](provider-acceptance/FINAL-SUMMARY.json)保留这一边界。

执行历史单独保留：[问卷](questionnaire/execution-attempts.json)首轮因输出目录参数被拒绝，exit 2、执行 0 个测试；修正后 8/8。[案例](cases/execution-attempts.json)首轮浏览器缓存不匹配，执行 0 个测试；下一轮虽有 2 个功能用例通过，但字体访问失败，不算最终视觉验收；随后使用内容相同的物理依赖副本完成最终浏览器验收。浏览器报告中的原始 VCS dirty 标志保留；最终工作树恢复状态另见 summary，不改写当时观测。

四个历史 issue #153、#155、#157、#161 仍待最终耐久性及完整 Worker–SPA 边界验收。旧 **3.5.1** soak 的 **797** 个样本、**47829.58 秒**仍是未完成记录，不能改称通过，也不能迁移归属到 3.5.3。案例 embeddings 使用合成常量 1024 维向量，未验证真实语义排序；真实模型那一轮也不替代这些待验边界。

[命令与环境边界](COMMANDS.md) · [核心截图索引](SCREENSHOTS.md) · [来源与变换记录](SOURCE-MANIFEST.json) · [本包 SHA-256](SHA256SUMS.json)。浏览器 report.json 是明确标注的精简公开投影，保留选择用例与结果；原始输入文件哈希可用于溯源。JUnit 与 7 张核心截图按字节保留。未纳入原始 live 对话、账单内容、网络/控制台记录、私有操作日志及历史归档目录。
