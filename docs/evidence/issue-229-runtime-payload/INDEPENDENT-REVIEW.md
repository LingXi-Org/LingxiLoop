# #229 runtime payload 独立审查

最终审查 head **`3b27f1e34fbaad886dfe0e6d4fad3b5c1b3ceb11`**，基线 `535873b941815b41961a44f56e479257cbb71626`。**未发现 P1/P2 功能、授权或打包缺陷，可以作为有限范围开发/draft PR 候选。不能据此合并、发包、部署或关闭 issue。** 完整独立本地检查运行于 `ef2aa158288feb41906f76dcd0dfae059b75372a`；后继仅恢复三处等价 UTF-8 字符及更新证据，已完成精确差异、hash 和最终 513 文件实物复核，不重复无变化流程。

## 消费者与保留范围

- 最终镜像仅缩小 `third_party/zcode` 的 COPY；SPA 阶段及其完整上游源码、编译脚本、Dockerfile-specific ignore 文件逐字节未变。
- 实际服务器 filesystem 路径为完整 visualize skill、生成的 `server/assets/visualize-runtime`、上游 `genUiTweakRuntime.js`。`readVisualizeResource` 明确把 `tweak.js` 映射到保留的上游文件，不使用被移除的重复 `runtime/tweak.js`。原授权、允许文件清单、内容 hash、realpath/符号链接检查保持。
- actual COPY 的 29 个 ZCode 文件与旧包全部 byte-identical：完整 24 文件 skill，加根 LICENSE/README/manifest、上游 LICENSE 和 served tweak script。Python helper、示例、references、runtime/vendor manifest 及所有 skill licenses 保留。根 pinned manifest 是源出处记录，不是运行时验证全部未打包引用源文件的调用点。
- 独立运行原 pinned-source verifier：223 manifest files、24 skill files、4 runtime files、4 vendor libraries 通过。SPA build inputs 完整保留；本轮不重复整站 SPA build，也不声称最终 OCI 通过。
- 独立 AST 审计覆盖 408 个 server 文件和 411 个入口闭包文件。408 包含本地生成的 gen-ui.js；原基线审计为 407。`lingxiloop` 包消费者、非字面 dynamic import/require、未解析 relative imports 均 0，剩余 21 个直接依赖都有入口消费者。
- runtime tools/skills 显式传对象给 `createProductHarness`/`assembleHarness`；已读实际安装 LingxiOS 3.5.6 的 profile 实现，`id: 'lingxiloop'` 是配置 ID，不解析成 npm 包。root manifest 没有此自链提供的 runtime API/bin。未发现可解释该自依赖的 filesystem、脚本或运行时插件消费者。

## 锁文件、隔离和迁移

独立从精确 git object 解析 base/candidate lock JSON，仅删除 `packages[''].dependencies.lingxiloop`、`packages['..']`、`packages['node_modules/lingxiloop']` 后，剩余整个对象深等，包括版本、resolved、integrity、optional/peer metadata。root package/lock、runtime 3.5.6、runtime 配置、迁移 runner/SQL、产品授权代码、bubblewrap/安全配置和部署文件未改变。

ef2 的额外文本变化为三处 `❤` 写成等价 `\u2764`，使 README 的 lock 大小与候选相差 9 bytes。root 已在最终 3b27 恢复原字符，逐字节等于原审计的最小删除候选：177,447 bytes，减少 5,726 bytes；没有其他 code diff。最终 README、receipt、inventory 及 checksum 已同步。未把 self-link 误称为安装整个 frontend 依赖树，也没有推断 node_modules 节省。

## 独立验证

| 检查 | 结果与实际范围 |
|---|---|
| production-rag-contract + release-smoke | 24/24 通过，0 skip，Node22，2.938 秒；日志 `contracts.log` |
| 精确来源/作者 evidence hash | 4/4 changed source hashes、25/25 SHA256SUMS entries 匹配；`ef2-source-proof.json` |
| actual local BuildKit scratch COPY | 固定 local default unix socket，FROM scratch、无 RUN、network none、无 image pull/tag/publish；新导出 inventory 与作者 after 全量相同 |
| 源 COPY payload | ef2 独立导出 513 files / 4,423,058 bytes；最终 3b27 实物 513 files / 4,423,049 bytes，唯一不同文件是恢复 UTF-8 的 server lock。ZCode 29 files / 1,182,142 bytes。旧 before 导出所有 inventory hash 也重新核对通过 |
| retained/source licenses | 完整 24-file skill 和 29 retained ZCode 全部与旧包同 hash；完整 upstream input verifier 通过 |
| prod-only exported launcher | 本人新导出树使用既有独立 production node_modules，实际 Web/Worker launcher、migration entry 均到预期 missing-DATABASE_URL guard，未出现 module/syntax failure |
| skill references | 实际 exported skill module 13 个允许引用成功，未知 traversal 拒绝，skill body 一致 |
| actual Python export | before/after 均 918,950 bytes，SHA256 `5f8dc7484e867a8ca7c8a050478e73a46918bf83e53c1114866bc79700f5c91c` |

无凭据探针通过严格子进程 env 运行：没有 DATABASE_URL、Redis 或 provider 配置，migration 在 import 环境校验停止，不执行迁移。`qualification.json` 和各日志只证明 package import/link/resource，**不是 DB readiness、隔离 Worker 成功启动或业务 HTTP 验收**。没有新下载、安装、生产、provider、DB 请求。

最终增量证据 `final-source-proof.json`：4/4 source hash、25/25 evidence checksum 通过；`the final local BuildKit export` 的全部 513 个 inventory hash 与最终收据相同。前后 payload 唯一改变路径为 `server/package-lock.json`，全部运行源、COPY、依赖语义、契约和 Python/skill 资源保持。因此保留先前独立执行结果，不把 root 的重跑写成自己的新执行。最终 worktree clean。测量脚本只把易混淆的 `base` 元数据名更正为 `checkoutHead`，实际源码绑定仍由逐文件 hash 完成。

## 计量边界和剩余门禁

最终 actual source COPY 的减少量为 199 files / 2,061,649 content bytes；其中 ZCode 减少 2,056,561 bytes。最终 deterministic gzip 为 1,037,325 bytes，减少 534,540 bytes。该测量不含 base image、production node_modules、built SPA、OCI 层/metadata。deterministic tar/gzip 是源文件集合的可复核压缩指标，不等于 OCI registry 传输大小。单次缓存导出时间不支持完整构建速度或 peak-disk 改善结论。

发布协调者已实际观察 base535 image 的 Worker 因 bubblewrap namespace 权限失败 exit1；此 PR 保持隔离且不解决该故障。本轮没有重跑或绕过该路径，不能将 guard 通过描述为 Worker healthy。最新权限仅开发/draft PR，以下保持未验证：

- 最终精确提交 CI、正式 immutable OCI build/provenance。
- OCI 实际 Web/Worker 及正确环境隔离启动、迁移与健康；现存 Worker 隔离故障仍是独立发布阻塞。
- 业务 provider/HTTP/PG、授权撤销竞态、整站 frontend build、本次完整 image 压缩/未压缩尺寸、安装前后磁盘和 peak disk。
- #216/#219 的 schema/组合门禁保持独立，不由此 PR 的打包契约覆盖。

没有动作被拒绝或执行结果不明。代码独审与后继 hash/measurement 增量复核已完成；上述最终 CI/OCI 和真实隔离 Worker 等未执行项仍是明确的待验边界。
