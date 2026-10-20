# PR235 independent measurement-evidence review

结论：固定 head `b82ebdb09ab269d1dc13fd149932d80bd2ba45b9` 未发现 P1/P2；可作为诚实、限定范围的 #229 测量证据合入。不能据此关闭 #229，不能把保留依赖候选视为已经证明无消费者，也不能用旧 ac906946 镜像数据代替后续组合镜像资格。

审查按 repository-review 技能执行，仅现有授权 git fetch 精确对象、GitHub PR metadata 读取、本地脚本/JSON/README审查及数值重算。未运行新增脚本的网络/容器路径，没有 npm、Docker、registry/package、Provider、数据库或生产调用，未改代码、认证、权限或分支。原 worktree 仍 clean，HEAD fbd7b02be9acb0314658d53deda23dc8ba338ccd。

## 范围与身份

PR merge-base 是 `c6c47bddeabb4488f9fe93391f15c695a528260c`，新增5份文档/测量JSON、4个独立测量脚本，共9文件；产品、依赖锁、Dockerfile、部署、CI接线均无修改。另行消费者审计与安全清理任务未被本PR替代。

报告精确绑定：

| 对照 | 源码 | OCI index | linux/amd64 manifest |
| --- | --- | --- | --- |
| #229改动前 | 535873b941815b41961a44f56e479257cbb71626 | sha256:b191c1ae502a24e864eaf52476d53792b68eb4e47840f0655a52fb677fa1081d | sha256:f2f84186e5ae62e125bfa061af6d296d9774baee6c67a877430565bbe7c23fea |
| PR230镜像 | ac9069460e99a20fac7f2c3de87c60f2bec66924 | sha256:6ac0d343039dbcb36607ff07e708134a9f5fbcbe6f1e51c04a8bca16801314ee | sha256:30534bf5570fa6ddd243a56bb6012343ee39cc94aab6c64fd31331c4006dc704 |

源码祖先关系支持这组对照。README的“immediate source baseline”应理解为 PR230 修改前基线：ac906946 的直接 parent 实际为3b27f1e，之间是#229实现与证据提交，不是535873直接parent。本轮没有新查询registry或生产，所以镜像与commit映射是对提交的机器收据和生成逻辑的核对，未冒充独立重新下载验证。

## 逐项重算与机器数据一致性

- 19个before / 22个after layer均逐行加总，compressed与expanded tar总量匹配：207,402,312→206,838,733，减少563,579 bytes，即0.27173226497%；625,566,208→623,327,232，减少2,238,976 bytes，即0.35791191586%。README的0.272% / 0.358%舍入正确。
- 共同digest确有5个，gzip合计79,803,125；两侧digest去重传输合计334,437,920。旧ZCode单层838,703 gzip / 3,446,272 tar与四个replacement层合计293,985 / 1,224,192相符。
- SPA JSON中两侧四类category总数、raw/gzip/Brotli都能加总到同一1134文件 / 60,850,325 raw / 37,282,434 per-file gzip / 35,408,899 per-file Brotli。完整路径+字节+内容hash的inventory digest相同，changedPaths空；dist层digest和36,674,684→36,674,695 gzip大小能交叉对应OCI总清单。README明确这不是HTTP实测传输，merged dist另有新增LICENSE文件，未混用1134与1135。
- dependency JSON的各entry kind与总entry数一致；两侧regular files均25376，regular bytes 253,889,424→253,883,731，减少5693；entry数减少1、symlink14→13。changedPaths只有 `.package-lock.json` 和 `lingxiloop` self-link。两个层digest与压缩字节数亦对应OCI清单。文档没有把这说成删掉整个前端依赖树。
- 候选扫描JSON与README的709 test/fixture文件、48 example/docs、481 Markdown、6045 maps以及对应字节一致。脚本按路径/后缀计数，分类可能重叠；owner累计每个命中文件一次。它跳过文件symlink，未作import/动态资源消费者分析。文档准确保留“未证明unused、未删除、尚不满足无测试开发文件总断言”的边界。

## 生成方法与安全边界

`measure-oci-manifest.py` 强制immutable @sha256，验证index和选中amd64 manifest的原始字节hash，排除unknown attestation，要求gzip层。stream模式对每个distinct blob计算压缩SHA256/长度、检查gzip结束并计expanded tar字节。image config的输出仅保留commit，不转储Env。GHCR匿名pull token仅在内存构造Authorization，没有输出或持久化凭据。

`measure-oci-layer-files.py` 流式hash原blob，按regular file内容hash/bytes及目录/link kind/target建立完整entry map，并输出changedPaths。这里是内容和link等价，不是uid/mode/mtime全metadata等价。`measure-oci-dist.mjs` 对给定exact layer验证压缩hash，在独占temp目录提取限定app/dist路径，再逐文件计算hash和gzip9/Brotli11，finally清理temp。它会临时落层与dist，不应与manifest/dependency工具的never stored/extracted声明混用；当前README已按各章节区分。

所有新增文本与JSON中未发现实际GitHub token、Bearer字面凭据、私钥或带认证URL；内容为公开镜像digest、路径、package名称和计数，没有用户对话、private body或production credential。脚本自身包含token变量与内存Authorization逻辑，未作为凭据误报。本轮未执行其网络或Docker代码。

README明确三类量的差别：完整OCI gzip/tar layer观测、源文件/单文件压缩计量、Docker本地Size/vfs实际占用；不将32% source gzip下降吹成whole image下降，也不把pull后的约11GB占用当controlled peak disk/build基准。不同build inputs/timing和受控冷暖构建未测均保留。

## 服务与验收边界

README把Web/Worker/migration的exit1 Missing DATABASE_URL明确限定为import/packaging检查，未宣称ready、健康、迁移执行或business pass。Python export固定hash只是一个实际资源路径检查。default Docker bwrap namespace失败、初次并发启动20秒超时被保留，未归因于生产节点，也未要求关闭隔离。生产部署由用户报告，本任务未查生产状态；CI 328pass/12skip不被写成所有路径已执行。

## 最小未验项

1. 本轮核对的是提交的逐层JSON与producer code；没有重新下载registry blobs。原始index/manifest/config/history字节、完整逐文件inventory及本地入口/regions/Python/bwrap stdout收据不在这9个新增文件中。故独立证据强度为“归档数值与方法一致”，不能称“本审查重新验证了全部OCI字节或本地启动”。后续需要逐字节追溯时应保留这些原始收据，不重写当前结果。
2. 25376是dependency COPY层regular file计量；merged /app/node_modules 25390表格是另一次现有镜像本地inventory，其详细计数口径/原始脚本收据未归档，本轮不跨口径计算节省或推断多出的14项。README没有用这两数计算百分比；核心whole-layer结论不依赖它。
3. 保留包内容的消费者/许可证/source-map诊断需求仍需逐包证明；无许可依据批量删tests/maps。本轮不实施清理。
4. 配置后的Web/Worker readiness、真实隔离执行、business/migration回归、controlled full cold/warm build时间和peak disk、后续组合final OCI及生产短观察仍待原责任人验证；#229继续开放。

交付 `source-proof.json` SHA256 `4e231b0c1bcf99a8c187531b7061f23b12f166de3f7dc06bcb89590cd54c0383`，含9文件hash、精确identity、逐层和跨JSON重算、scope和未验限制。首次gh metadata读取遇到旧CLI不支持baseRefOid（本地参数错误，未发请求），换成支持字段成功；没有仓库权限拒绝或绕过。首次本地审计把“baseline”错误理解为直接parent而断言退出，已用真实祖先链澄清，未修改任何原始数据。
