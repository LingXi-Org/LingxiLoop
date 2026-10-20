# #217 数值内容补修

**数值验收未通过，仅交付 draft。确定性契约修复已验证，真实模型内容质量仍有红例，不能据此关闭 #217 或宣称已完整解决。**

范围：跟进 [原始验收记录](https://github.com/LingXi-Org/LingxiLoop/blob/7344210a/docs/evidence/issue-213-217/ACCEPTANCE.md) 中真实模型生成的比较错误与趋势 partial。开发基线 `754cd873e3b96308ae6e18b93eca57c485a9bbb3`，正式依赖 LingxiOS 3.5.8；交付前本隔离分支快进到 `4c57fce92c316628e59600203c7ba48722f61636`，新增发布/Canvas 文件不与本补修重叠。本轮不重做已上线 UI、性能或其他 issue。最终仅交付 draft PR，指定集成人负责合并、部署和关单。

## 复算和定位

原始输入保留在 `visualize-quality-live.test.ts`；没有把答案加入模型输入。独立精确有理数计算见 [oracle.json](../../../artifacts/issue-217-quality/oracle.json)，审查者另行复算。

| 已观察缺陷 | 输入所确定的结果 | 责任层 |
| --- | --- | --- |
| 比较图交点与正文写约 500 元 | `100+2n=5n`，`n=100/3`，两方案费用均 `500/3≈166.67` 元 | 生成 HTML 计算了正确的 `cy`，却另写错误标签；原正文也错 |
| n=20 写“选甲（140<100）” | 甲 140、乙 100，选乙；n=50 则甲 200、乙 250，选甲 | 生成 HTML 的 `a<b`/`b<a` 推荐分支反向 |
| 趋势 partial | 利润 `[4,7,5,10,14,20]`，逐月差 `[3,-2,5,4,6]` | 生成 HTML 误用 `p-sales[i-1]`；runtime 的内容评审也曾把 +5 误称最大 |

销售额绝对增量 `[6,-1,8,6,9]`；两序列绝对增长最快都在第 6 月。若问百分比，销售额最大在第 2 月（50%），利润最大在第 4 月（100%）。不能把两种口径混用。

原始 [comparison.html](../../../artifacts/issue-217-quality/original/comparison.html) SHA-256 `980ecb22cabedd1be0eef4e2ed82f92bb2df492b0fba40cf515c9ac2599f3a03`、[trend.html](../../../artifacts/issue-217-quality/original/trend.html) SHA-256 `d9961e4cc3f20f5dceff0743937842e1f3ae2cc7007f0b226feb444d4c412edd` 与原专用测试库一致，未改写。官方浏览器原比较用例 **2/2 红**，保留 [错误交点](../../../artifacts/issue-217-quality/screenshots/original-comparison-intersection-red.png)、[错误推荐](../../../artifacts/issue-217-quality/screenshots/original-comparison-decision-red.png) 与 [原始断言日志](../../../artifacts/issue-217-quality/logs/original-comparison-red.txt)。这些失败是固定历史输出的回归证据，不是应删掉的测试。

原趋势历史回放 **未进入浏览器数学断言**：服务端启动被 `A delivered complete real-model reference is required` 拦住，因为原运行 partial。没有删除完成门槛、移动文件或绕过 403；[失败日志](../../../artifacts/issue-217-quality/logs/original-trend-history-blocked.txt) 保留。趋势数值定位来自原 HTML 和独立算术。

## 最小接入改动

- 产品提示与 `visualize.save` 描述要求输入/公式/派生序列单一数据来源，图形、标签、推荐、无障碍文字同源；检查端点、阈值两侧、相等和下降区间；完整读回并核对正文。没有写入本案的固定答案，也没有自动改写已保存历史。
- 提取原有纯 fragment 校验供 native save 复用。相同的完整文档拒绝变为明确 `invalid_arguments` / `no_effect`，提醒移除文档外壳；授权、数据库失败仍走原路径。无安全边界放宽。
- 最终回复若**只有**一个代码块/行内代码，其中恰为本运行所保存文档的引用，交给 LingxiOS 现有修复预算处理。使用已安装 Markdown parser 和原 ZCode parser；代码块仍不执行。匹配 tenant/run/agent/principal/path，合法导出、文字回退、带解释代码示例保持原行为。

独立审查先发现“保存后强制内嵌”的广泛校验会破坏保存后导出；已收窄并新增回归。当前不声称能捕获所有错误引用（例如“文字 + fenced reference”不在本次收窄检测范围）。

这不是通用数学证明器：保存哈希只核验存储，引用校验只核验可显示性和访问权限；模型自评 `succeeded` 不作为数值验收。任意 HTML 的语义正确性仍须实际输出与独立计算比对。

## 真实 provider 记录

沿用安全启动器、SiliconFlow `zai-org/GLM-5.3-Flash`、正式 runtime/native tools 和共享 ledger。只有 IM 投递是明确的 recording fixture；模型没有 mock。仅运行两条原始合成提示，不重跑七场景 40 调用套件。

首轮仅含数值生成提示改动，尚无随后两个契约修复：

| 用例 | 实际结果 | 调用 / 已记录费用 |
| --- | --- | --- |
| comparison | 181344ms 后 failed；两次发送完整 `DOCTYPE/html/head/body` 文档，被原 fragment 校验拒绝；无保存文档 | 6 / $0.02487566，`measured=false`，费用不完整 |
| trend | 176780ms，runtime succeeded/delivered，但最终答复只有 fenced reference，原 parser 正确不挂载；完成验收失败 | 8 / $0.0138269，measured=true |

见 [原始结果](../../../artifacts/issue-217-quality/provider/results.json) 与 [日志](../../../artifacts/issue-217-quality/logs/provider-initial.txt)。每案上限 12 调用、1M tokens、$0.10、180 秒。合计 14 调用，已记录 $0.03870256；因一案未完整计量，不宣称这是完整费用。

首轮趋势最终 [HTML v2](../../../artifacts/issue-217-quality/provider/trend-0.html) 正确派生利润差值，但仍有表格增量最大值高亮错位和“张口逐月变大”不符合第 3 月回落的问题。不能凭数值数组正确就把这轮判绿。其 [真实最终答案](../../../artifacts/issue-217-quality/provider/visualize-quality-trend.md) 仍保留代码围栏。

随后只针对上述新证据修正两个契约，再执行同两案，每案最多 10 调用、1M tokens、$0.10、180 秒，单并发。首次准备 follow-up 时，夹具尝试给原测试用户建立第二个机构成员关系，触发数据库外键约束；发生在 ingress 前，无新运行或模型调用。核对后复用原测试机构/身份，在新对话中执行；不移动既有会话、不放宽成员约束。[准备失败记录](../../../artifacts/issue-217-quality/logs/provider-repair1-preflight-failure.txt) 保留。

第二轮 comparison 已完成：`partial/delivered`，153867ms、7 调用、$0.0117018（measured=true），没有 save、保存文档或完整引用。真实输出 [comparison-answer.md](../../../artifacts/issue-217-quality/provider-repair1/comparison-answer.md) 虽写出约 166.7 元，却只返回 fenced HTML，且留下重复甲线及错误 SVG 坐标：按该图自身坐标系，交点应为 `(246.67,256.67)`，实际 `(282.7,253.3)`；错误甲线终点 y=40 仍与正确 y=190 的线同时存在。此案继续判红，不自动抽出代码块执行。

第二轮 trend：`succeeded/delivered`，152834ms、4 调用、$0.00520606（measured=true），返回 [普通 Markdown 表格与分析](../../../artifacts/issue-217-quality/provider-repair1/trend-answer.md)，没有保存文档或引用。表内利润、差分及第 6 月最大绝对增量与独立计算一致，但正文“从第 4 个月起进入持续加速扩张”不严谨（第 5 月增量下降），且没有可视化，仍不作为可视化质量通过。不能为了制造截图把表格或代码强制转换成图。

第二轮完成验收 **0/2**，11 次实际调用、已完整计量 $0.01690786；[结果](../../../artifacts/issue-217-quality/provider-repair1/results.json)、[失败日志](../../../artifacts/issue-217-quality/logs/provider-repair1.txt)。两轮总计 **25 次调用，已记录费用 $0.05561042**，首轮 comparison 含未完整计量调用，因此总费用只是已记录金额。没有继续付费重试，也没有把这两个样本推广成触发率或性能结论。

候选输出缺少已投递且完整的可视化引用，故本轮没有合格候选卡片可做修复后浏览器数值截图/交互验收。原红例已实测，契约层已红绿验证；**模型端到端数值正确性与可视化交付仍待解决**。此阻塞是输出质量失败，不是缺原始测试数据或环境权限拒绝。

## 验证与复用

失效模型和确定性回归先于对应代码。原契约两项先红；修补后与原 visualize/runtime 集成共 **12/12 通过、0 skip**，含非法完整文档无写入、修正 fragment 真正保存、代码围栏修复提示、导出/回退/其他运行示例不受影响和权限撤销不得通过。[日志](../../../artifacts/issue-217-quality/logs/contract-final.txt)。首次 revocation 用例误期望抛异常，实际既有合同返回 failed record；修正为验证非成功，保留 [该失败轮](../../../artifacts/issue-217-quality/logs/contract-after.txt)。另一次缺测试 secret 的配置失败也 [保留](../../../artifacts/issue-217-quality/logs/contract-config-error.txt)，未计为通过。

`server:typecheck`、`server:lint`、E2E TypeScript 和 `verify:visualize` 通过。先前提示改动检查点 server tests 106/106；后续 guard 变化由上述 owning integration 覆盖，不把此前全套结果描述为最终 guard 的重跑。

实际复用：

- [ZCode](https://github.com/zai-org/ZCode/tree/0a1fc56d279fd1001f78387bd81aec1c26767411)，Apache-2.0，`0a1fc56d279fd1001f78387bd81aec1c26767411`：完整原 skill、reference parser、guest/host 与 `render.py`。223 固定文件、24 skill、4 runtime entry、4 vendor/license 对校验通过，归档不变。
- [LingxiOS](https://github.com/LingXi-Org/LingxiOS) 正式 `@lyyzka/lingxios@3.5.8`，MIT，使用 public native ToolDefinition、RunVerificationContext 和现有修复流程；没有复制内部运行时或变更上游 API。
- [mdast-util-from-markdown](https://github.com/syntax-tree/mdast-util-from-markdown) 已安装 `2.0.3`，MIT，直接调用 `fromMarkdown`。不新造 Markdown/引用/流式协议。
- 官方 `tester-army/e2e@0.17.0`、`@e2e-dev/web@0.12.0` 运行浏览器。无直接 Playwright 导入。

依赖、锁文件、migration、ZCode 原始归档、已上线 UI、RunActivity 和 Markdown 动画均未修改。任意 HTML 渐进执行、原生 Clipboard 权限拒绝和真实触屏覆盖仍属于 [既有边界](../issue-213-217/ACCEPTANCE.md)，本补修不改变这些结论。

## 复跑范围

纯算术：`python docs/evidence/issue-217-quality/recompute.py`，打印完整计算结果并与保存的 oracle 比对。产品确定性回归：

```sh
# 仅设置独立 regression 测试库与测试 Redis/secret，不能指向历史证据库。
npm run test:integration -- --file visualize-quality-contract.test.ts \
  --file visualize-runtime.test.ts --file visualize.test.ts
npm run server:typecheck
npm run server:lint
npm run test:e2e:typecheck
npm run verify:visualize
```

历史比较红例必须使用原专用数据库 `lingxiloop_issue213217_test` 和
`AGENT_OS_HOMES_ROOT=/workspace/LingxiLoop-213-217/.e2e/trigger-homes`。
设置 `INTEGRATION_DATABASE_URL`、原测试 Redis、浏览器目录后：

```sh
E2E_TELEMETRY_DISABLED=1 E2E_VISUALIZE_HISTORY_CASE=comparison \
  npx e2e run --config e2e.visualize-quality.config.ts
```

此命令预期失败，不能纳入普通绿色 CI 作为已修复样本。`trend` 场景明确受完整投递引用门槛阻塞。

真实模型测试仅在 `LINGXIOS_LIVE_VISUALIZE_QUALITY=1` 显式启用，通过现有 `lingxi-prod model-run` 执行 `visualize-quality-live.test.ts`。该测试仅接受本地 `lingxiloop_issue217_quality_test`、既有 `/issue217-quality-homes` 根、指定 provider/model 和有界预算。不会 reset；对话存在则拒绝重跑。`VISUALIZE_QUALITY_ATTEMPT` 与独立输出目录区分各轮，follow-up 复用原测试身份/机构，旧行和旧 HTML 均保留。默认 skip 不计为通过。本次到已记录的两轮为止，不安排额外全量运行。

独立审查还发现不同 attempt 误用同一输出目录可能覆盖旧 `results.json`；已在任何 ingress 前以原子 `mkdir` 要求全新输出目录。此夹具保护在两轮之后加入，不宣称两轮运行已执行此最后保护；没有为此再调用模型。

浏览器证据为 1440×960 的同环境历史回放；本轮没有性能提升主张。原始 E2E traces 留在本地 `.e2e/issue217-quality-original-red-raw`，提交截图和文本失败结果，避免附带临时页面令牌。没有生产用户数据。
