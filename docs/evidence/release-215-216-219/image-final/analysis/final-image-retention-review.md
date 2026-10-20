# Final image retention notes — source-backed preparation

冻结源码：Loop `d1075e35e16721979b484c2d9e33eeb56468ce9d`，server lock正式 `@lyyzka/lingxios@3.5.8`。只读核对；未拉取完整镜像、未改产品/共享依赖、未运行生产操作。**本段为镜像发布前的源码准备说明；实际冻结OCI复核结果已追加于下文。保留不等于所有字节均必需，本轮未完成全部精简。**

| 项目 | 已确认消费者/保留依据 | 不能据此推断的结论 |
| --- | --- | --- |
| PDF.js active legacy parser、worker、CMaps、fonts、WASM | 正式358 `dist/src/context/document-worker.js:26–32` 动态导入 `pdfjs-dist/legacy/build/pdf.mjs`，从包根定位 `cmaps/`、`standard_fonts/`、`wasm/`。保留parser/worker及整套动态资源，覆盖不同PDF字体/编码/解码。真实358 triangle PDF前后201字节输出相同；379保留文件hash相同、全部11个license保留。 | 单一PDF不证明每种资源都被实际执行，也不证明所有generic build、types、legacy source maps在服务器均有业务消费者。它们属于本轮未扩大的保守边界；不能把“保留”解释成“每字节均已证明不可删”。 |
| 已裁剪PDF.js viewer和3张generic maps | 仅server deps树删 `web/`、`legacy/web/` 和3个明确 `build/*.mjs.map`；正式358完整prod-install扫描17,422个代码/JSON文件仅3处消费者（两个metadata+native worker）。175文件/10,508,615 raw bytes已独立核验；保留集零改变。 | package-copy gzip −2,037,920字节不是最终镜像实测节省。SPA有独立完整依赖树，不能把server裁剪收益再算成前端bundle裁剪。 |
| `@lyyzka/lingxios` runtime/kernel/control-plane | `server/src/agent-runtime/runtime.ts:1–2` 直接导入公开 `createLingxiOS/assembleHarness/doctor` 及worker；memory、PDF/docx、IPC/worker和SQL schema均由正式包公开入口承载。正式包不得因目录或bundle大就任意拆散。 | 不是包内所有CLI、maps或资源都已逐个证明必要；进一步删包内文件须重新追踪动态子进程/资源/公共exports及迁移。若actual largest指SPA的 `runtime-*.js`，须依完整路径及Vite输入映射重新认定，不能冒认为同一个原生runtime。 |
| `sql.js` 或名称含sql的asset | **当前server lock无`sql.js`包，正式LingxiOS的直接依赖只有mammoth与pdfjs-dist。** 尚无完整最终asset路径/内容归属，保留为未分类项；需要actual receipt路径、hash、import/manifest及bundler provenance。 | 不能据文件名说它是必需SQL数据库引擎，也不能因server无同名包就删掉SPA语法高亮、图表或编辑器动态资源。未证明消费者之前不作“可删”结论。 |
| native canvas `.node` | server锁链 `pdfjs-dist → optional @napi-rs/canvas@1.0.8 → platform .node`；PDF.js legacy模块Node初始化主动 `require('@napi-rs/canvas')`，供缺失的DOMMatrix/Path2D及NodeCanvasFactory使用。`js-binding.js:213–231`按libc选择GNU/musl分支。 | npm标optional不等于当前运行路径可删。Bookworm/glibc的GNU分支有明确使用依据；同树musl分支不是已证实在本镜像实际加载，仍是可能的定平台清理候选，不能宣称两个二进制都必需。删其一需结合最终平台、libc检测、native loader回退和PDF资源短测另审；本轮未删除。 |
| esbuild及平台binary | **生产运行依赖链**：三个启动脚本直接 `tsx server/src/...ts`；server lock `tsx@4.23.13 → esbuild@0.28.2 → @esbuild/linux-x64@0.28.2`。esbuild JS加载器定位/执行本平台binary，TS启动不是单靠SPA构建时工具。 | 不能把esbuild一概当devDependency删掉。本地真实prod install中 `esbuild/bin/esbuild` 与 `@esbuild/linux-x64/bin/esbuild`是同inode、nlink=2、各逻辑size11,427,952：可能为硬链接，不能看两条大路径就按双份磁盘/OCI节省计数；最终OCI需核tar entry type/link target。 |
| Node/Debian、Python、bubblewrap、tini、CA | 最终stage仍使用Node22 Bookworm slim，`npm/tsx`启动Web/Worker/migrate；正式LingxiOS engines≥22.13。Python由kernel `pythonCommand`和真实Visualize `render.py`导出消费；runtime.ts的生产bwrap preflight/隔离必须保留；tini是PID1入口，CA用于合法HTTPS依赖。 | 这些事实不证明整个OS层中每个包/工具都不可精简；但替换基础镜像、删Python/隔离/CA/npm启动链是独立运行模型变化，不能作为无行为影响清理。本轮未证明等价更小运行时，也未削弱隔离。 |
| 完整SPA、BlockNote/PDF worker/语法资源 | Dockerfile的SPA stage完整安装/构建独立于server prune。AttachmentViewer直接导入generic PDF worker URL；ContentEditor直接接官方BlockNote完整schema/UI、code syntax highlighter、math/diagram；保留用户要求的完整原生功能与历史富内容。 | 不把大前端chunk或语言资源仅因“大”认作无用，也不据名字推断sql.js归属。后续须以实际生成asset的导入图/懒加载路径和官方功能约束核对，不能用删除支持语言/编辑器功能制造体积下降。 |

**可直接用于中文说明：** 本轮只删除已核实无服务器消费者的PDF.js viewer资源与三张generic source map；实际使用的legacy解析器、worker、字体/编码/WASM资源和许可证保留。Node、Python/隔离、tsx→esbuild及PDF native canvas均有现存运行链。其余大文件按实际路径追踪，未证明可删的部分未动；不声称所有保留项均不可再精简。最终压缩层、展开层及SPA新增功能的净增减，以冻结OCI审计为准，不能把包目录gzip减量当整镜像减量。

**English wording:** This pass removes only audited server-side PDF.js viewer assets and three generic-build source maps. The active legacy parser/worker, font/CMap/WASM resources and licenses remain intact. Node, the Python/isolation path, tsx→esbuild and PDF native canvas have existing runtime consumers. Other large files remain pending path-specific provenance; retention is not proof that every retained byte is indispensable. Package-copy savings are not whole-image savings. Final compressed/expanded layer totals and the effect of added SPA features must come from the frozen OCI audit.

复核依据：`pr235-prune-independent-review.md`、`pr235-prune-source/exact-server358-consumers.json`、`pr235-prune-source/independent-qualified358-verification.json`；正式server锁、源码Dockerfile/runtime.ts/visualize-export.ts/ContentEditor.tsx/AttachmentViewer.tsx，以及独立真实prod install中PDF.js Node loader/canvas loader/esbuild loader。此前PR235 head89cdee54的绿CI不替代最终d107精确CI；publish_only流程完成也不表示生产已部署。**hold继续，不执行任何生产动作。**

## 冻结 d107 OCI 的实际复核补充

已只读核对父线程的 `final-image-audit-result-d107/{receipt,rootfs-inventory}.json`、`pr236-d107-rootfs-analysis.json` 和 `pr236-d107-build-observations.json`。冻结 index **`sha256:697d5a3e3d34629e603c120cd068abde3a2add611f583d5444d77a947887bf69`**，linux/amd64 manifest `sha256:1c437ff4f2b2f36055fddcf179460963d9f95147406989b48355a0020e4bf862`，源码仍为 `d1075e35e16721979b484c2d9e33eeb56468ce9d`。本复核未下载任何镜像/文件正文，也未访问生产。

独立重算通过：inventory文件SHA256与回执 `3d537b85a17d2dd22790264678a83ce64e147f2f0192f4e2bfda40d666f8c96a` 一致；22层压缩总和 **205,959,232字节**、展开tar层总和 **618,504,704字节**；merged rootfs regular文件 **583,749,649字节**。另逐文件与现有正式prod-install参考比对，**474个LingxiOS文件、379个裁剪后PDF.js文件全部hash/size匹配，0差异**。结果见 `final-image-retention-independent-check.json`。这是实际内容审计通过，不是configured readiness、隔离或部署通过；原回执也明确这些未测。

相对历史已发布 `6ac0d343…` / `ac906946`（3.5.6旧功能集），压缩层净减 **879,501字节，约0.425%**；展开tar层净减 **4,822,528字节，约0.774%**。本轮没有重拉历史baseline，使用其已保存实测值；最终组合也加入了3.5.8/215/216/219等功能，因此这不是相同功能输入的PDF裁剪单因素实验。**当前整镜像净改善很小，不能用175文件/10.5MB raw或包gzip −2.04MB宣称“大幅降低整镜像”。**

| 实际重要大项 | 本次已确认依据 | 精确保留/候选边界 |
| --- | --- | --- |
| `/usr/local/bin/node` **124,827,920 B** | 当前最终启动链为npm→tsx→TS Web/Worker/migrate；正式runtime要求Node≥22.13。 | 不可把Node当闲置开发工具直接删。更换/定制基础镜像是另项兼容运行验证；未证明同等更小替代品。 |
| GNU canvas **33,974,784 B**；musl canvas **30,315,608 B** | PDF.js Node模块主动require native canvas；loader按libc分支选择。 | GNU消费者已确认；**musl尚未证明在Bookworm/glibc目标实际加载**，是优先定平台裁剪候选，不能称必需，也不能未做loader/平台/PDF回归就直接删。 |
| esbuild平台binary **11,427,952 B** | tsx生产执行链确实依赖它。 | inventory明确 `app/node_modules/esbuild/bin/esbuild` 是指向 `@esbuild/linux-x64/bin/esbuild` 的**hardlink**，不是第二份11.4MB数据。3个hardlink共15,234,762逻辑字节另列，不能再次加入regular/层总数；删一个别名不等于省掉整份binary。 |
| `js-tiktoken` **22,432,828 B**，两个index约5.6MB/个 | server锁：openlit→js-tiktoken。实际 `openlit/dist/helpers.js:30` 用CommonJS `require('js-tiktoken')`，`:304/312` 使用encodingForModel及gpt2回退；包exports的require映射到 `dist/index.cjs`。 | **CJS入口有具体消费者**；不证明ESM入口与每个独立ranks副本都需要。另一格式/字典是否可删需完整条件exports、其他消费者和模型族覆盖审计；不能按两份近似大小直接合并或删整个tokenizer。 |
| PDF.js legacy worker map **5,466,926 B**、legacy main map **2,399,899 B**；worker JS **2,395,538 B** | worker/parser是实际PDF文本路径；maps属于当前活跃legacy实现的诊断资源，本轮特意不改。 | **maps不是已证实业务执行必需文件**，保留是有界审计决定；后续可单独核查source-map/stack诊断需求。动态字体/CMap/WASM仍有真实路径消费者。 |
| SPA Mermaid chunk **3,790,768 B** | 产品明确在聊天Markdown `createMermaidPlugin`、历史memos `await import('mermaid')` 及完整BlockNote diagram能力使用Mermaid。 | 产品能力消费者明确；精确hashed chunk由哪条bundler边引入仍需构建import图，不能只凭名字指定唯一归属；不可通过删图表能力缩包。 |
| 四张starter头像PNG合计 **9,121,773 B**，`everyone.png` **2,120,167 B** | 最终rootfs确有这些public→dist资源。对冻结d107的src/server/src/public文本直接搜索，没有找到这两个路径族的调用文字。 | **未确认现行消费者，也未证明无用**：尚未核查历史持久avatar URL、间接路径和旧客户端，故应列明确后续候选，而非包装成“必需默认头像”或直接删除。 |
| Telemetry大包：semantic-conventions约12.0MB、metrics exporter约12.0MB、transformer约9.6MB | 产品 `lingxilit-observability.ts:10,455–474` 静态导入Openlit，按现有OTLP endpoint条件初始化并禁止内容capture；Openlit metrics模块实际构造OTLPMetricExporter/PeriodicExportingMetricReader，锁中依赖链存在。 | 支持telemetry功能并非无消费者；但**不证明多种OTel版本、格式、source maps和包内test/fixture全部必要**。进一步去重必须检查实际版本/API和初始化，不能删除观测能力或改变敏感内容策略。 |

**关于此前的“runtime bundle / sql.js”**：完整inventory中**不存在basename恰为 `sql.js` 的文件，不存在 `runtime-bundle` 路径，也没有SPA `runtime*`命名资产**。实际有 `app/dist/assets/sql-BLtJtn59.js`（23,407 B）、`sql-BML-ASG2.js`（25,380 B）、`sql-CRqJ_cUM.js`（23,428 B）；本次未读取其正文或取得对应bundle输入映射，**仅路径不能证明其是SQL引擎、语言高亮或其他模块**，也不能据名字删掉。正式原生 `runtime/runtime.js`仅106,058 B，整个474-file LingxiOS包约2.69MB，不能与5.6MB的js-tiktoken index混称。

**仍未完成的硬验收**：#229继续open。完整镜像已真实减量，但仍有6050张dependency source map（43,257,857 B）、710个test/fixture路径文件（3,857,308 B）等未证明可删项，类别有重叠，不能相加当潜在收益。受控同cache策略的cold/warm完整构建和峰值磁盘仍缺失；371秒publish job、328秒build-push步骤及1.68GB root-dev-install `du`分别是单次workflow耗时/安装观察，**都不是受控cold/warm比较或峰值磁盘**。还须按最终镜像完成configured Web/Worker/readiness/隔离与受影响关键路径、正式迁移/上线短验，并补其余清理/私有host职责与可恢复清理证据。**不能以此回执为清零关单依据；hold与禁止生产动作保持。**

**更新后的简短对外说明 / Short usable wording**：

> 冻结镜像已核对全部层和最终文件，正式runtime与裁剪后PDF.js逐文件匹配。相比历史已发布版本，整镜像仅净减约0.43%压缩层、0.77%展开层；这是包含新增功能的组合净变化，不能全部归因于PDF裁剪。Node、生产TS执行链和PDF解析资源有实际消费者；musl二进制、部分重复格式/字典、旧头像与诊断文件仍需逐项证明可删。硬链接未重复计算。#229仍开放，受控构建时间/峰值磁盘和最终上线验收未完成。
>
> The frozen image's layers and merged file inventory are verified, including every formal runtime and retained PDF.js file. Versus the recorded historical release, net layer size falls by only about 0.43% compressed and 0.77% expanded. This is the combined change with added features, not an attribution to PDF pruning alone. Runtime consumers justify Node, the production TypeScript launcher and active PDF resources; musl binaries, alternate package formats/data, legacy avatars and diagnostics still need targeted deletion evidence. Hardlinks are not double-counted. Issue #229 remains open; controlled build-time/peak-disk measurements and final operational acceptance are outstanding.
