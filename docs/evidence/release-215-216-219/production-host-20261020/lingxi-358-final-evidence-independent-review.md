# LingxiLoop runtime3.5.8 最终生产证据独立验收

结论：**PASS — 已有材料支持本轮目标部署及窄恢复完成，18项最终验收全部通过，无待处理终态或发现的发布阻断P1/P2。** 目标应用提交 `d1075e35e16721979b484c2d9e33eeb56468ce9d`，runtime `3.5.8`，native schema `13`，产品迁移 `48`，manifest pin `f56db73dabbaec1e92a421bbad76c239ed8d1ae2`。

这是一份实际证据验收，取代“恢复脚本可执行”作为本轮结果的结论。v2 continuation 在2026-10-20 14:33:25.459 UTC完成；数据库postflight在14:34:12完成；最终服务只读采集为14:35:59–14:36:23；最终18/18验收记录时间14:36:35.332。不是持续可用性或后续版本部署保证。

审查者只读取本地材料并重算SHA、逐字段核对，未请求生产API、未执行部署/SQL/provider操作、未新增隔离测试、未修改既有回执或3.5.3观察任务。

## 实际操作终态完整性

从原维护执行、v2恢复和postflight事件独立构建更新清单，与终态集合核对：**27个唯一ID全量相等**，无遗漏/多余/重复，精确operation、Stack type/id和success状态匹配；所有Complete，服务端开始结束时间顺序无重叠。

其中26次成功，唯一保留失败为WebB初次DeployStackService `6ad778a1e06d5e1f79836ea6`，Compose Pull的已知522失败，未被改写为成功。之后成功恢复动作分别是：

| 动作 | update ID | 服务端耗时 |
|---|---|---:|
| WebB恢复 | `6ad77ae3e06d5e1f79836f1b` | 39.228秒 |
| WorkerA恢复 | `6ad77b3de06d5e1f79836f2f` | 14.645秒 |
| WorkerB恢复 | `6ad77b7ae06d5e1f79836f3d` | 18.836秒 |

初始WebA成功部署 `6ad7786be06d5e1f79836e99` 和migration `6ad77847e06d5e1f79836e91` 均在同一精确终态清单中。没有未解决的pending/uncertain操作。备份 `6ad777ebe06d5e1f79836e77` 在migration前完成，绑定新attempt/commandHash/source；173表countsBefore与countsRestored逐行相等，恢复来源验证通过，隔离恢复数据库已移除。该结论来自已封存成功恢复回执，不代表审查者重新恢复过备份。

## 当前部署身份、版本与健康

最终回执中四服务均为目标d107，运行、healthy、非restarting、restartCount0、OOMfalse、healthFailingStreak0。精确镜像index为 `sha256:697d5a3e3d34629e603c120cd068abde3a2add611f583d5444d77a947887bf69`。两宿主RepoDigest、Descriptor、linux/amd64和全部22层diffID与既有镜像审计逐项一致。

| 服务 | 最终容器ID |
|---|---|
| WebA | `56dd3a69e18befd03751747e50714644d40bf3c2fa460759faa91aefed3259ca` |
| WorkerA | `db00775ed034a287a18b4c0c83acfd2b403986e3ee68cb5325ebb09a369c1fe0` |
| WebB | `1bce8732adcde5c77c15043027d2f6402ce521e24acfdb3090217a786cc2574b` |
| WorkerB | `88cc0114a43d9e43cccc60df0469f35fc604fd6e3f6cc1006786bcf9e927c98b` |

这些身份在v2健康事件、state postflight和最终服务采集中一致。WebA仍是恢复开始时保存的原目标容器，未被窄恢复替换。各服务安全policy与原生产before记录完全相等；不据此声称原policy本身通过了完整安全审计。

v2最终state和独立数据库postflight均readOnly/fullVisibility，runtime3.5.8、native/installed schema13、protocol11、product/count48、schemaHash `2bb265989aa2e4f5cf7686d9108e70ab970688a112a8baaa8f03b97f998bdc41` 及全48条迁移清单与plan完全一致。恢复后otherClients=21属于已运行服务连接，不能把维护期间“零writer屏障”继续要求为运行期恒等条件。

## 公开页面与验证器修正

/api/health、/readyz、/api/health/dependencies、/api/meta四端点HTTP200且内容检查通过；依赖数据库、Redis、OpenNotebook均true，meta显示d107/runtime3.5.8/schema13。首页和入口JS/CSS三次200，实际SHA逐个与已审计rootfs-inventory匹配，inventory文件SHA也与审计receipt匹配；没有仅依赖matchesAuditedImage布尔字段。

原最终验收只有workerStartupSelfChecksInferred=false，原因是采集器错误预期generic Node的docker-entrypoint.sh。已核对精确冻结d107 Dockerfile第133行是 `ENTRYPOINT ["/usr/bin/tini", "--"]`。新只读采集保留两Worker实际entrypoint数组，均精确tini；npm worker:start命令和原生5190 readyz检查同时匹配。最终验收新增“原失败仅该项且完整保留”的约束，没有删除其余检查。

v1恢复错误硬编码ImageId的失败回执也保留：它在任何Komodo execute之前停止；v2依据宿主实际ImageId及审计层身份恢复。两个验证器错误不是生产成功，后续通过不得抹除历史失败。

## 封存SHA链

| 材料（均在/tmp/lingxi-358-production） | SHA256 |
|---|---|
| production-host-final-acceptance.json | `a755887e1de6bdb735c0af85219a770d1d377ea082b57f9da0af6d7f4975224a` |
| production-host-after-v2.json | `1003335717a8f587a39dc129aa148ad67ad3d29a83820e3ee31dbbc23781e31d` |
| host-target-state-postflight.json | `ce65dd7e4120fd1a9277033714650798183c3b2e940b1c81be36f8a4ee31f505` |
| public-host-assets-after.json | `bcdd6132666bbc2ef49f642c87e8070aa7ed51021b57754bcc2c00297d21b1fa` |
| host-continuation-komodo-terminal-receipts.json | `9b814415cbe48a7c4048989ede1efb2e822f0f856e78b4060f5df74084eb4401` |
| maintenance-host-continuation-v2.json | `9a7656118cb10bb2b9d51bcb61c79530d8a3e98c6e015721e9042bc0afff7e66` |
| maintenance-host-continuation.json（v1失败） | `8891fdd6c6ce5bf85e650772e74c0a6dc8d490356d3eb16983748b49d4e9a54f` |
| maintenance-host-execution.json（初始522保留） | `1abf04ec0bd4bf9af1f4883a33189d70f65764c787f6e674c0de2c36f6f623fa` |
| production-host-continuation-acceptance.json（旧预期失败） | `cb227dcf878ea76b010e6174ecbbcfb58d50d5b5963042dabfd693512ba5a589` |

本审查可重复数据核对脚本 `/tmp/lingxi-358-reconcile-final-evidence.py`，执行仅访问本地证据并输出独立摘要 `/tmp/lingxi-358-final-evidence-independent-acceptance.json`；没有触发生产或新增系统测试。

## 剩余限制

- 未做认证业务/聊天/provider smoke；没有既有授权cookie或company ID，未创建或复制凭据。本次部署验收不等价于“查看记忆”真实provider性能、业务端到端或长对话已验证。
- 启动bwrap/kernel自检通过仍是基于精确源、启动命令及原生readyz的推断，不是完整隔离/故障注入矩阵；未碰3.5.3隔离耐久观察。
- 这是采样与时间点证据，不承诺长soak、持续零中断或所有负载路径覆盖。既有mirror偶发522及Compose always-pull依赖并未被证明永久消失。
- schema13/product48已经落库，任何后续恢复必须尊重该兼容边界；不能重新启动native12旧Worker。后续237属于另一个候选和验收范围。

上述限制应如实带入最终发布记录，但不是要求本次重复部署或添加新的故障测试。没有本审查发起而被拒绝、pending或结果不确定的生产动作。
